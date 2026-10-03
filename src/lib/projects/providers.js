import { OrgProviderStatus } from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import {
  evaluateProviderQualification,
  normalizeProviderCompliance,
  validateProviderCompliance,
} from "@/lib/projects/provider-compliance";
import {
  buildGeneratedProviderProfile,
  behavioursForBatch,
  GENERATE_MIX,
  MAX_GENERATE_COUNT,
  normalizeProviderBehaviour,
  providerBehaviourLabel,
  providerNameSlug,
} from "@/lib/projects/provider-behaviours";
import {
  normalizeProviderCategories,
  normalizeProviderCategory,
} from "@/lib/projects/provider-terms";
import { formatOrgUsername, PROJECT_ORG_LEARN_PASSWORD } from "@/lib/projects/org-user-identity";
import { hashOrgUserPassword } from "@/lib/projects/org-user-password";
import { generateShortAlphanumericCode, ensureProjectCode } from "@/lib/projects/project-identity";

/** Synthetic domain for simulated provider portal logins. */
export const PROVIDER_PORTAL_EMAIL_DOMAIN = "provider.learn";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIN_RE = /^\d{10}$/;

export const PROVIDER_QUALIFICATION_FILTER = {
  ALL: "ALL",
  QUALIFIES: "QUALIFIES",
  NOT_QUALIFIES: "NOT_QUALIFIES",
};

/**
 * Lightweight shape embedded in procurement records (offers, awards, LPOs…).
 * @param {any} row
 */
export function serializeProviderSummary(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email || null,
    phone: row.phone || null,
    registrationRef: row.registrationRef || null,
    physicalAddress: row.physicalAddress || null,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * @param {any} row
 * @param {{
 *   projectCode?: string | null;
 *   includeCredentials?: boolean;
 *   method?: string | null;
 *   category?: string | null;
 * }} [opts]
 */
export function serializeProvider(row, opts = {}) {
  const compliance = normalizeProviderCompliance(row.compliance);
  const qualification = evaluateProviderQualification(
    { ...row, compliance },
    { method: opts.method || null, category: opts.category || null },
  );
  const out = {
    ...serializeProviderSummary(row),
    contactPerson: row.contactPerson || null,
    tin: row.tin || null,
    categories: normalizeProviderCategories(row.categories),
    linesOfBusiness: row.linesOfBusiness || null,
    compliance,
    ppdaSuspended: Boolean(row.ppdaSuspended),
    behaviour: row.behaviour || null,
    behaviourLabel: providerBehaviourLabel(row.behaviour),
    isGenerated: Boolean(row.isGenerated),
    statusReason: row.statusReason || null,
    portalLastLoginAt: row.portalLastLoginAt || null,
    createdBy: row.createdBy
      ? {
          id: row.createdBy.id,
          displayName: `${row.createdBy.firstName || ""} ${row.createdBy.lastName || ""}`.trim(),
        }
      : null,
    qualification,
  };
  if (opts.includeCredentials) {
    out.portal = row.portalEmail
      ? {
          loginEmail: formatOrgUsername(row.portalEmail, opts.projectCode),
          password: PROJECT_ORG_LEARN_PASSWORD,
        }
      : null;
  }
  return out;
}

const PROVIDER_INCLUDE = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
};

/**
 * Unique base portal email within the project (login scopes it with the project code).
 * @param {import("@prisma/client").PrismaClient | any} db
 * @param {string} projectId
 * @param {string} name
 */
async function allocatePortalEmail(db, projectId, name) {
  const slug = providerNameSlug(name);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateShortAlphanumericCode(4).toLowerCase();
    const portalEmail = `${slug}.${code}@${PROVIDER_PORTAL_EMAIL_DOMAIN}`;
    const clash = await db.projectOrgProvider.findFirst({
      where: { projectId, portalEmail },
      select: { id: true },
    });
    if (!clash) return portalEmail;
  }
  throw new Error("Could not allocate a provider portal login.");
}

/**
 * @param {unknown} v
 * @param {number} max
 */
function str(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Validate + normalise a create/update payload.
 * @param {any} body
 */
export function validateProviderInput(body) {
  const b = body || {};
  /** @type {Record<string, string>} */
  const fieldErrors = {};

  const name = str(b.name, 255);
  const email = str(b.email, 255).toLowerCase();
  const phone = str(b.phone, 64);
  const contactPerson = str(b.contactPerson, 160);
  const physicalAddress = str(b.physicalAddress, 255);
  const registrationRef = str(b.registrationRef, 128);
  const tin = str(b.tin, 32).replace(/\s+/g, "");
  const linesOfBusiness = str(b.linesOfBusiness, 500);
  const categories = normalizeProviderCategories(b.categories);
  const behaviour = normalizeProviderBehaviour(b.behaviour);

  if (!name) fieldErrors.name = "Enter the provider's registered name.";
  if (email && !EMAIL_RE.test(email)) fieldErrors.email = "Enter a valid email address.";
  if (tin && !TIN_RE.test(tin)) fieldErrors.tin = "A URA TIN has exactly 10 digits.";
  if (!categories.length) fieldErrors.categories = "Choose at least one category.";
  if (!physicalAddress) fieldErrors.physicalAddress = "Enter the provider's physical address.";

  Object.assign(fieldErrors, validateProviderCompliance(b.compliance));

  const compliance = normalizeProviderCompliance(b.compliance);
  if (registrationRef && compliance.URSB_REGISTRATION.held && !compliance.URSB_REGISTRATION.number) {
    compliance.URSB_REGISTRATION.number = registrationRef;
  }
  if (tin && compliance.TIN.held && !compliance.TIN.number) compliance.TIN.number = tin;

  if (Object.keys(fieldErrors).length) {
    return { ok: false, fieldErrors, error: "Please fix the highlighted fields." };
  }

  return {
    ok: true,
    data: {
      name,
      email: email || null,
      phone: phone || null,
      contactPerson: contactPerson || null,
      physicalAddress,
      registrationRef: registrationRef || null,
      tin: tin || null,
      categories,
      linesOfBusiness: linesOfBusiness || null,
      compliance,
      ppdaSuspended: Boolean(b.ppdaSuspended),
      behaviour,
    },
  };
}

/**
 * Register listing with qualification filter + pagination. The register is
 * organisation-scoped and small, so qualification is evaluated in memory.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   status?: string | null;
 *   search?: string | null;
 *   category?: string | null;
 *   checkCategory?: string | null;
 *   ids?: string[];
 *   qualification?: string | null;
 *   method?: string | null;
 *   page?: number;
 *   pageSize?: number;
 *   includeCredentials?: boolean;
 * }} opts
 */
export async function listProviders(prisma, opts) {
  /** @type {Record<string, unknown>} */
  const where = { projectId: opts.projectId };
  if (opts.status && Object.prototype.hasOwnProperty.call(OrgProviderStatus, opts.status)) {
    where.status = opts.status;
  }
  if (Array.isArray(opts.ids) && opts.ids.length) {
    where.id = { in: opts.ids.map((x) => String(x)).slice(0, 100) };
  }
  const search = String(opts.search || "").trim();
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { registrationRef: { contains: search } },
      { tin: { contains: search } },
      { linesOfBusiness: { contains: search } },
    ];
  }

  const [rows, projectCode] = await Promise.all([
    prisma.projectOrgProvider.findMany({
      where,
      include: PROVIDER_INCLUDE,
      orderBy: [{ name: "asc" }],
    }),
    opts.includeCredentials ? ensureProjectCode(prisma, opts.projectId) : Promise.resolve(null),
  ]);

  const category = normalizeProviderCategory(opts.category);
  const checkCategory = normalizeProviderCategory(opts.checkCategory);
  let serialized = rows.map((r) =>
    serializeProvider(r, {
      projectCode,
      includeCredentials: opts.includeCredentials,
      method: opts.method || null,
      category: category || checkCategory,
    }),
  );
  if (category) serialized = serialized.filter((p) => p.categories.includes(category));

  const counts = {
    all: serialized.length,
    qualifies: serialized.filter((p) => p.qualification.qualifies).length,
    notQualifies: serialized.filter((p) => !p.qualification.qualifies).length,
  };

  const q = String(opts.qualification || "").toUpperCase();
  if (q === PROVIDER_QUALIFICATION_FILTER.QUALIFIES) {
    serialized = serialized.filter((p) => p.qualification.qualifies);
  } else if (q === PROVIDER_QUALIFICATION_FILTER.NOT_QUALIFIES) {
    serialized = serialized.filter((p) => !p.qualification.qualifies);
  }

  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 10));
  const total = serialized.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageCount, Math.max(1, Number(opts.page) || 1));
  const providers = serialized.slice((page - 1) * pageSize, page * pageSize);

  return { providers, total, page, pageSize, pageCount, counts };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} providerId
 * @param {{ includeCredentials?: boolean; method?: string | null; category?: string | null }} [opts]
 */
export async function getProvider(prisma, projectId, providerId, opts = {}) {
  const row = await prisma.projectOrgProvider.findFirst({
    where: { id: providerId, projectId },
    include: PROVIDER_INCLUDE,
  });
  if (!row) return null;
  const projectCode = opts.includeCredentials ? await ensureProjectCode(prisma, projectId) : null;
  return serializeProvider(row, { ...opts, projectCode });
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} name
 * @param {string | null} [excludeId]
 */
async function nameTaken(prisma, projectId, name, excludeId = null) {
  const existing = await prisma.projectOrgProvider.findFirst({
    where: { projectId, name, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { id: true },
  });
  return Boolean(existing);
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; actorOrgUserId: string; actorRoleName: string; body: any }} opts
 */
export async function createProvider(prisma, opts) {
  const v = validateProviderInput(opts.body);
  if (!v.ok) return v;

  if (await nameTaken(prisma, opts.projectId, v.data.name)) {
    return {
      ok: false,
      status: 400,
      error: "A provider with this name is already in the register.",
      fieldErrors: { name: "This provider name is already registered." },
      code: "PROVIDER_NAME_TAKEN",
    };
  }

  const portalEmail = await allocatePortalEmail(prisma, opts.projectId, v.data.name);
  const portalPasswordHash = await hashOrgUserPassword(PROJECT_ORG_LEARN_PASSWORD);

  const row = await prisma.projectOrgProvider.create({
    data: {
      projectId: opts.projectId,
      ...v.data,
      status: OrgProviderStatus.ACTIVE,
      portalEmail,
      portalPasswordHash,
      createdByOrgUserId: opts.actorOrgUserId,
    },
    include: PROVIDER_INCLUDE,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROVIDER_CREATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      providerId: row.id,
      name: row.name,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true, provider: serializeProvider(row) };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerId: string; actorOrgUserId: string; actorRoleName: string; body: any }} opts
 */
export async function updateProvider(prisma, opts) {
  const existing = await prisma.projectOrgProvider.findFirst({
    where: { id: opts.providerId, projectId: opts.projectId },
    select: { id: true },
  });
  if (!existing) return { ok: false, status: 404, error: "Not found." };

  const v = validateProviderInput(opts.body);
  if (!v.ok) return v;

  if (await nameTaken(prisma, opts.projectId, v.data.name, opts.providerId)) {
    return {
      ok: false,
      status: 400,
      error: "A provider with this name is already in the register.",
      fieldErrors: { name: "This provider name is already registered." },
      code: "PROVIDER_NAME_TAKEN",
    };
  }

  const row = await prisma.projectOrgProvider.update({
    where: { id: opts.providerId },
    data: v.data,
    include: PROVIDER_INCLUDE,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROVIDER_UPDATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      providerId: row.id,
      name: row.name,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true, provider: serializeProvider(row) };
}

/**
 * PDU-side register status (separate from the simulated PPDA suspension flag).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerId: string; status: string; reason?: string; actorOrgUserId: string; actorRoleName: string }} opts
 */
export async function setProviderStatus(prisma, opts) {
  const status = String(opts.status || "").toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(OrgProviderStatus, status)) {
    return { ok: false, status: 400, error: "Choose a valid status." };
  }
  const reason = str(opts.reason, 500);
  if (status === OrgProviderStatus.SUSPENDED && !reason) {
    return {
      ok: false,
      status: 400,
      error: "Enter the reason for suspending this provider.",
      fieldErrors: { reason: "Enter the suspension reason." },
    };
  }

  const existing = await prisma.projectOrgProvider.findFirst({
    where: { id: opts.providerId, projectId: opts.projectId },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false, status: 404, error: "Not found." };

  const row = await prisma.projectOrgProvider.update({
    where: { id: opts.providerId },
    data: {
      status,
      statusReason: status === OrgProviderStatus.ACTIVE ? null : reason || null,
    },
    include: PROVIDER_INCLUDE,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROVIDER_STATUS_CHANGED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      providerId: row.id,
      name: row.name,
      fromStatus: existing.status,
      toStatus: status,
      reason: reason || null,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true, provider: serializeProvider(row) };
}

/**
 * Hard delete only while the provider has no procurement history; otherwise
 * the PDU must suspend or deactivate so records stay intact.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerId: string; actorOrgUserId: string; actorRoleName: string }} opts
 */
export async function deleteProvider(prisma, opts) {
  const row = await prisma.projectOrgProvider.findFirst({
    where: { id: opts.providerId, projectId: opts.projectId },
    include: {
      _count: {
        select: {
          purchaseInstructions: true,
          solicitationInvites: true,
          offers: true,
          evaluationReports: true,
          awards: true,
          contracts: true,
          lpos: true,
        },
      },
    },
  });
  if (!row) return { ok: false, status: 404, error: "Not found." };

  const used = Object.values(row._count || {}).some((n) => Number(n) > 0);
  if (used) {
    return {
      ok: false,
      status: 409,
      code: "PROVIDER_IN_USE",
      error:
        "This provider already appears in procurement records, so it cannot be deleted. Suspend or deactivate it instead.",
    };
  }

  await prisma.projectOrgProvider.delete({ where: { id: row.id } });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROVIDER_DELETED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      providerId: row.id,
      name: row.name,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true };
}

/**
 * Generate N fictional providers with a mix of behaviours.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; count: unknown; mix?: unknown; category?: unknown; actorOrgUserId: string; actorRoleName: string }} opts
 */
export async function generateProviders(prisma, opts) {
  const count = Math.floor(Number(opts.count));
  if (!Number.isFinite(count) || count < 1 || count > MAX_GENERATE_COUNT) {
    return {
      ok: false,
      status: 400,
      error: `Enter a number between 1 and ${MAX_GENERATE_COUNT}.`,
      fieldErrors: { count: `Enter a number between 1 and ${MAX_GENERATE_COUNT}.` },
    };
  }
  const mixRaw = String(opts.mix || GENERATE_MIX.MIXED).toUpperCase();
  const mix = Object.prototype.hasOwnProperty.call(GENERATE_MIX, mixRaw) ? mixRaw : GENERATE_MIX.MIXED;
  const category = normalizeProviderCategory(opts.category);

  const passwordHash = await hashOrgUserPassword(PROJECT_ORG_LEARN_PASSWORD);
  const existingNames = new Set(
    (
      await prisma.projectOrgProvider.findMany({
        where: { projectId: opts.projectId },
        select: { name: true },
      })
    ).map((r) => r.name.toLowerCase()),
  );

  const behaviours = behavioursForBatch(count, mix);
  const today = new Date();
  /** @type {any[]} */
  const created = [];

  for (const behaviour of behaviours) {
    let profile = buildGeneratedProviderProfile({ behaviour, category, today });
    for (let attempt = 0; attempt < 10 && existingNames.has(profile.name.toLowerCase()); attempt += 1) {
      profile = buildGeneratedProviderProfile({ behaviour, category, today });
    }
    if (existingNames.has(profile.name.toLowerCase())) {
      profile = { ...profile, name: `${profile.name} ${generateShortAlphanumericCode(3)}` };
    }
    existingNames.add(profile.name.toLowerCase());

    const portalEmail = await allocatePortalEmail(prisma, opts.projectId, profile.name);
    const row = await prisma.projectOrgProvider.create({
      data: {
        projectId: opts.projectId,
        ...profile,
        isGenerated: true,
        status: OrgProviderStatus.ACTIVE,
        portalEmail,
        portalPasswordHash: passwordHash,
        createdByOrgUserId: opts.actorOrgUserId,
      },
      include: PROVIDER_INCLUDE,
    });
    created.push(serializeProvider(row));
  }

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROVIDERS_GENERATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      count: created.length,
      mix,
      category,
      providerIds: created.map((p) => p.id),
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true, providers: created };
}

/**
 * Find a provider by exact registered name, or register it inline. Used by
 * procurement steps that still accept a fresh provider payload. Never fails on
 * an existing name — it reuses that record.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; actorOrgUserId: string; actorRoleName: string; body: any }} opts
 */
export async function createOrGetProvider(prisma, opts) {
  const b = opts.body || {};
  const name = str(b.name, 255);
  const email = str(b.email, 255);
  if (!name) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: { name: "Enter the provider's registered name." },
    };
  }
  if (email && !EMAIL_RE.test(email)) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: { email: "Enter a valid email address." },
    };
  }

  const existing = await prisma.projectOrgProvider.findFirst({
    where: { projectId: opts.projectId, name },
  });
  if (existing) {
    return { ok: true, supplier: serializeProviderSummary(existing), created: false };
  }

  const portalEmail = await allocatePortalEmail(prisma, opts.projectId, name);
  const row = await prisma.projectOrgProvider.create({
    data: {
      projectId: opts.projectId,
      name,
      email: email || null,
      phone: str(b.phone, 64) || null,
      registrationRef: str(b.registrationRef, 128) || null,
      status: OrgProviderStatus.ACTIVE,
      portalEmail,
      portalPasswordHash: await hashOrgUserPassword(PROJECT_ORG_LEARN_PASSWORD),
      createdByOrgUserId: opts.actorOrgUserId,
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROVIDER_CREATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      providerId: row.id,
      name: row.name,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      inline: true,
    },
  });

  return { ok: true, supplier: serializeProviderSummary(row), created: true };
}

/**
 * Server-side "Run validation" for a selection of providers. Learning mode:
 * never blocks on failed checks — callers record `warnings` instead. Only
 * unknown ids (URL guessing / other projects) are rejected.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerIds: unknown; method?: string | null; category?: string | null }} opts
 */
export async function assessProviderSelection(prisma, opts) {
  const ids = Array.from(
    new Set(
      (Array.isArray(opts.providerIds) ? opts.providerIds : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 50);
  if (!ids.length) {
    return { ok: true, providers: [], warnings: [], failedProviderCount: 0 };
  }
  const rows = await prisma.projectOrgProvider.findMany({
    where: { projectId: opts.projectId, id: { in: ids } },
  });
  if (rows.length !== ids.length) {
    return {
      ok: false,
      status: 400,
      error: "One or more selected providers are not in this organisation's register.",
    };
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const category = normalizeProviderCategory(opts.category);
  const providers = ids.map((id) => {
    const row = byId.get(id);
    const q = evaluateProviderQualification(
      { ...row, compliance: normalizeProviderCompliance(row.compliance) },
      { method: opts.method || null, category },
    );
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      qualifies: q.qualifies,
      failedReasons: q.failedReasons,
      warningCount: q.warningCount,
    };
  });
  const warnings = providers
    .filter((p) => !p.qualifies)
    .map((p) => `${p.name}: ${p.failedReasons.join("; ")}`);
  return {
    ok: true,
    providers,
    warnings,
    failedProviderCount: providers.filter((p) => !p.qualifies).length,
  };
}
