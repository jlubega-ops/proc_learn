import {
  OrgLpoStatus,
  OrgContractStatus,
  OrgOfferStatus,
  OrgProviderStatus,
  OrgSolicitationStatus,
  OrgSolicitationType,
} from "@prisma/client";
import { getAppSession } from "@/lib/auth/session";
import { sessionIdleMs, touchSessionActivity } from "@/lib/auth/session-idle";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import {
  isProviderPortalIdentifier,
  parseOrgLoginIdentifier,
} from "@/lib/projects/org-login-identity";
import { verifyOrgUserPassword } from "@/lib/projects/org-user-password";
import { notifyOrgUsers, OrgNotificationType } from "@/lib/projects/org-notifications";
import { providerCategoryLabel, providerTerm } from "@/lib/projects/provider-terms";
import {
  PROVIDER_DOCUMENTS,
  evaluateProviderQualification,
  normalizeProviderCompliance,
} from "@/lib/projects/provider-compliance";
import { serializeInvoice, invoiceInclude } from "@/lib/projects/invoices";

const ACCEPTING_STATUSES = [OrgSolicitationStatus.ISSUED, OrgSolicitationStatus.ADVERTISED, OrgSolicitationStatus.OPEN];

export { isProviderPortalIdentifier };

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ identifier: string; password: string }} p
 */
export async function authenticateProviderPortalLogin(prisma, { identifier, password }) {
  const parsed = parseOrgLoginIdentifier(identifier);
  if (parsed?.kind !== "provider") return { ok: false, code: "invalid_format" };

  const project = await prisma.project.findFirst({
    where: { projectCode: parsed.projectCode, isPublished: true },
    select: { id: true, name: true, projectCode: true },
  });
  if (!project) return { ok: false, code: "project_unavailable" };

  const provider = await prisma.projectOrgProvider.findFirst({
    where: { projectId: project.id, portalEmail: parsed.email },
  });
  if (!provider || !provider.portalPasswordHash) return { ok: false, code: "invalid_credentials" };

  const passwordOk = await verifyOrgUserPassword({ passwordHash: provider.portalPasswordHash }, password);
  if (!passwordOk) return { ok: false, code: "invalid_credentials", projectId: project.id, providerId: provider.id };

  if (provider.status !== OrgProviderStatus.ACTIVE) {
    return { ok: false, code: "provider_inactive", projectId: project.id, providerId: provider.id };
  }

  await prisma.projectOrgProvider.update({
    where: { id: provider.id },
    data: { portalLastLoginAt: new Date() },
  });

  return { ok: true, provider, project };
}

/**
 * Route Handlers only: validates the provider session (idle, provider still active,
 * project still published) and slides the idle timer.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function requireProviderPortalSession(prisma) {
  const session = await getAppSession();
  if (!session?.providerId) return { ok: false, status: 401, error: "Sign in to the provider portal." };

  const last = Number(session.lastActivityAt);
  if (Number.isFinite(last) && last > 0 && Date.now() - last > sessionIdleMs()) {
    session.destroy();
    await session.save();
    return { ok: false, status: 401, error: "Your session expired. Please sign in again.", code: "idle_expired" };
  }

  const provider = await prisma.projectOrgProvider.findUnique({
    where: { id: session.providerId },
    include: { project: { select: { id: true, name: true, projectCode: true, isPublished: true } } },
  });
  if (!provider || provider.status !== OrgProviderStatus.ACTIVE || !provider.project?.isPublished) {
    session.destroy();
    await session.save();
    return { ok: false, status: 401, error: "Your provider account is no longer active." };
  }

  touchSessionActivity(session);
  await session.save();
  return { ok: true, session, provider, project: provider.project };
}

/**
 * Read-only check for Server Components (never writes cookies).
 */
export async function getReadableProviderSessionId() {
  const session = await getAppSession();
  if (!session?.providerId) return null;
  const last = Number(session.lastActivityAt);
  if (Number.isFinite(last) && last > 0 && Date.now() - last > sessionIdleMs()) return null;
  return session.providerId;
}

/**
 * @param {URLSearchParams} sp
 */
export function parsePortalPaging(sp) {
  const page = Math.max(1, Number.parseInt(sp.get("page") || "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(sp.get("pageSize") || "10", 10) || 10));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

/** @param {any} provider */
export function serializePortalProvider(provider) {
  const categories = Array.isArray(provider.categories) ? provider.categories : [];
  return {
    id: provider.id,
    name: provider.name,
    email: provider.email || null,
    contactPerson: provider.contactPerson || null,
    physicalAddress: provider.physicalAddress || null,
    categories,
    providerWord: providerTerm(categories[0] || null),
    portalLastLoginAt: provider.portalLastLoginAt || null,
    organisation: provider.project ? { id: provider.project.id, name: provider.project.name } : null,
  };
}

const ELIGIBILITY_METHODS = [
  { method: "MICRO", label: "Micro procurement" },
  { method: "QUOTATION", label: "Quotation (RFQ)" },
  { method: "TENDER", label: "Open tender" },
];

/**
 * What the organisation holds about the provider and how it qualifies per method.
 * @param {any} provider
 */
export function serializePortalProfile(provider) {
  const compliance = normalizeProviderCompliance(provider.compliance);
  return {
    ...serializePortalProvider(provider),
    phone: provider.phone || null,
    registrationRef: provider.registrationRef || null,
    tin: provider.tin || null,
    linesOfBusiness: provider.linesOfBusiness || null,
    status: provider.status,
    statusReason: provider.statusReason || null,
    ppdaSuspended: Boolean(provider.ppdaSuspended),
    categoryLabels: (Array.isArray(provider.categories) ? provider.categories : []).map((c) =>
      providerCategoryLabel(c),
    ),
    documents: PROVIDER_DOCUMENTS.map((d) => ({
      key: d.key,
      label: d.label,
      numberLabel: d.numberLabel,
      hasExpiry: d.hasExpiry,
      held: Boolean(compliance[d.key]?.held),
      number: compliance[d.key]?.number || null,
      expiresAt: compliance[d.key]?.expiresAt || null,
    })),
    eligibility: ELIGIBILITY_METHODS.map((m) => {
      const q = evaluateProviderQualification(provider, { method: m.method });
      return {
        method: m.method,
        label: m.label,
        qualifies: q.qualifies,
        warningCount: q.warningCount,
        checks: q.checks.map((c) => ({
          key: c.key,
          label: c.label,
          passed: c.passed,
          warning: c.warning,
          reason: c.reason,
        })),
      };
    }),
  };
}

/** @param {any} offer */
function serializePortalOffer(offer) {
  if (!offer) return null;
  return {
    id: offer.id,
    amount: offer.amount?.toString?.() ?? String(offer.amount ?? ""),
    status: offer.status,
    source: offer.source || "OFFICER",
    deliveryDays: offer.deliveryDays ?? null,
    remarks: offer.remarks || null,
    submittedAt: offer.submittedAt,
    withdrawnAt: offer.withdrawnAt || null,
  };
}

/**
 * RFQs the provider was invited to, plus advertised tenders open to all providers.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerId: string; page: number; pageSize: number; skip: number }} opts
 */
export async function listPortalOpportunities(prisma, opts) {
  const where = {
    projectId: opts.projectId,
    status: { in: [...ACCEPTING_STATUSES, OrgSolicitationStatus.CLOSED] },
    OR: [
      { solicitationType: OrgSolicitationType.RFQ, invites: { some: { supplierId: opts.providerId } } },
      { solicitationType: OrgSolicitationType.TENDER, status: { not: OrgSolicitationStatus.DRAFT } },
    ],
  };
  const [total, rows] = await Promise.all([
    prisma.projectOrgSolicitation.count({ where }),
    prisma.projectOrgSolicitation.findMany({
      where,
      orderBy: [{ closingDate: "desc" }, { createdAt: "desc" }],
      skip: opts.skip,
      take: opts.pageSize,
      include: {
        procurement: {
          select: {
            id: true,
            procurementNumber: true,
            title: true,
            procurementMethod: true,
            requisition: { select: { category: true, deliveryLocation: true } },
          },
        },
        offers: {
          where: { supplierId: opts.providerId },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
  ]);
  const now = Date.now();
  return {
    total,
    page: opts.page,
    pageSize: opts.pageSize,
    items: rows.map((s) => {
      const accepting = ACCEPTING_STATUSES.includes(s.status) && (!s.closingDate || s.closingDate.getTime() > now);
      const myOffer = s.offers[0] || null;
      return {
        id: s.id,
        type: s.solicitationType,
        title: s.title,
        status: s.status,
        issueDate: s.issueDate,
        closingDate: s.closingDate,
        accepting,
        procurement: {
          id: s.procurement?.id,
          number: s.procurement?.procurementNumber,
          title: s.procurement?.title || null,
          method: s.procurement?.procurementMethod,
          category: s.procurement?.requisition?.category || null,
          deliveryLocation: s.procurement?.requisition?.deliveryLocation || null,
        },
        myOffer: serializePortalOffer(myOffer),
        canEdit: Boolean(accepting && myOffer && myOffer.status === OrgOfferStatus.SUBMITTED),
        canSubmit: Boolean(accepting && (!myOffer || myOffer.status === OrgOfferStatus.WITHDRAWN)),
      };
    }),
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; solicitationId: string; providerId: string }} opts
 */
export async function loadPortalSolicitation(prisma, opts) {
  const s = await prisma.projectOrgSolicitation.findFirst({
    where: { id: opts.solicitationId, projectId: opts.projectId },
    include: { invites: { where: { supplierId: opts.providerId }, select: { id: true } } },
  });
  if (!s) return null;
  if (s.solicitationType === OrgSolicitationType.RFQ && !s.invites.length) return null;
  return s;
}

/**
 * Tell the procurement officer that a provider acted in the portal.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string; title: string; body: string; relatedEntityType: string; relatedEntityId: string }} opts
 */
export async function notifyOfficerOfPortalAction(prisma, opts) {
  const procurement = await prisma.projectOrgProcurement.findFirst({
    where: { id: opts.procurementId, projectId: opts.projectId },
    select: { officer: { select: { id: true, linkedUserId: true } } },
  });
  if (!procurement?.officer) return;
  try {
    await notifyOrgUsers(prisma, {
      projectId: opts.projectId,
      recipients: [procurement.officer],
      type: OrgNotificationType.WORKFLOW_TASK,
      title: opts.title,
      body: opts.body,
      linkUrl: `/projects/${opts.projectId}/procurements/${opts.procurementId}`,
      relatedEntityType: opts.relatedEntityType,
      relatedEntityId: opts.relatedEntityId,
    });
  } catch {
    // Notifications are best-effort.
  }
}

/**
 * Purchase Instructions, LPOs and contracts issued to the provider.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerId: string; page: number; pageSize: number; skip: number }} opts
 */
export async function listPortalOrders(prisma, opts) {
  const procSelect = { select: { id: true, procurementNumber: true, title: true, status: true } };
  const [pis, lpos, contracts] = await Promise.all([
    prisma.projectOrgPurchaseInstruction.findMany({
      where: { projectId: opts.projectId, supplierId: opts.providerId, status: { in: ["ISSUED", "ACCEPTED"] } },
      include: { procurement: procSelect },
    }),
    prisma.projectOrgLpo.findMany({
      where: { projectId: opts.projectId, supplierId: opts.providerId, status: { not: OrgLpoStatus.CANCELLED } },
      include: { procurement: procSelect },
    }),
    prisma.projectOrgContract.findMany({
      where: {
        projectId: opts.projectId,
        supplierId: opts.providerId,
        status: { not: OrgContractStatus.CANCELLED },
      },
      include: { procurement: procSelect },
    }),
  ]);

  const all = [
    ...pis.map((r) => ({
      kind: "PURCHASE_INSTRUCTION",
      id: r.id,
      number: r.instructionNumber,
      value: r.amount?.toString?.() ?? "",
      status: r.status,
      issuedAt: r.issuedAt,
      deliveryAddress: r.deliveryAddress || null,
      procurement: r.procurement,
      sortAt: r.issuedAt || r.createdAt,
    })),
    ...lpos.map((r) => ({
      kind: "LPO",
      id: r.id,
      number: r.lpoNumber,
      value: r.lpoValue?.toString?.() ?? "",
      status: r.status,
      issuedAt: r.issuedAt,
      deliveryAddress: r.deliveryAddress || null,
      procurement: r.procurement,
      sortAt: r.issuedAt || r.createdAt,
    })),
    ...contracts.map((r) => ({
      kind: "CONTRACT",
      id: r.id,
      number: r.contractNumber,
      value: r.contractValue?.toString?.() ?? "",
      status: r.status,
      issuedAt: r.issuedAt,
      deliveryAddress: r.deliveryAddress || null,
      procurement: r.procurement,
      sortAt: r.issuedAt || r.createdAt,
    })),
  ].sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime());

  const procurementIds = [...new Set(all.map((o) => o.procurement?.id).filter(Boolean))];
  const invoiced = procurementIds.length
    ? await prisma.projectOrgInvoice.groupBy({
        by: ["procurementId"],
        where: {
          projectId: opts.projectId,
          procurementId: { in: procurementIds },
          status: { in: ["RECEIVED", "CERTIFIED", "VERIFIED", "APPROVED_FOR_PAYMENT"] },
        },
        _sum: { amount: true },
      })
    : [];
  const accepted = procurementIds.length
    ? await prisma.projectOrgDelivery.findMany({
        where: {
          projectId: opts.projectId,
          procurementId: { in: procurementIds },
          inspection: { status: { in: ["ACCEPTED", "PARTIAL"] } },
        },
        select: { procurementId: true },
      })
    : [];
  const invoicedBy = new Map(invoiced.map((r) => [r.procurementId, Number(r._sum.amount || 0)]));
  const acceptedSet = new Set(accepted.map((d) => d.procurementId));

  const page = all.slice(opts.skip, opts.skip + opts.pageSize).map(({ sortAt: _sortAt, ...o }) => {
    const already = invoicedBy.get(o.procurement?.id) || 0;
    const remaining = Math.max(0, Number(o.value || 0) - already);
    return {
      ...o,
      procurement: o.procurement
        ? { id: o.procurement.id, number: o.procurement.procurementNumber, title: o.procurement.title || null }
        : null,
      alreadyInvoiced: already.toFixed(2),
      remaining: remaining.toFixed(2),
      hasAcceptedDelivery: acceptedSet.has(o.procurement?.id),
      canInvoice: acceptedSet.has(o.procurement?.id) && remaining > 0.009,
    };
  });

  return { total: all.length, page: opts.page, pageSize: opts.pageSize, items: page };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerId: string; page: number; pageSize: number; skip: number }} opts
 */
export async function listPortalInvoices(prisma, opts) {
  const where = { projectId: opts.projectId, supplierId: opts.providerId };
  const [total, rows] = await Promise.all([
    prisma.projectOrgInvoice.count({ where }),
    prisma.projectOrgInvoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: opts.skip,
      take: opts.pageSize,
      include: {
        ...invoiceInclude,
        procurement: { select: { id: true, procurementNumber: true, title: true } },
        payments: { select: { amount: true, status: true } },
      },
    }),
  ]);
  return {
    total,
    page: opts.page,
    pageSize: opts.pageSize,
    items: rows.map((r) => {
      const paid = r.payments
        .filter((p) => p.status === "PAID")
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      return {
        ...serializeInvoice(r),
        procurement: r.procurement
          ? { id: r.procurement.id, number: r.procurement.procurementNumber, title: r.procurement.title || null }
          : null,
        paidAmount: paid.toFixed(2),
      };
    }),
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerId: string; page: number; pageSize: number; skip: number }} opts
 */
export async function listPortalPayments(prisma, opts) {
  const where = { projectId: opts.projectId, invoice: { supplierId: opts.providerId } };
  const [total, rows] = await Promise.all([
    prisma.projectOrgPayment.count({ where }),
    prisma.projectOrgPayment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: opts.skip,
      take: opts.pageSize,
      include: {
        invoice: { select: { id: true, invoiceNumber: true, supplierReference: true, amount: true } },
        procurement: { select: { id: true, procurementNumber: true, title: true } },
      },
    }),
  ]);
  return {
    total,
    page: opts.page,
    pageSize: opts.pageSize,
    items: rows.map((p) => ({
      id: p.id,
      amount: p.amount?.toString?.() ?? "",
      status: p.status,
      paymentReference: p.paymentReference || null,
      paymentDate: p.paymentDate || null,
      createdAt: p.createdAt,
      invoice: p.invoice
        ? {
            id: p.invoice.id,
            invoiceNumber: p.invoice.invoiceNumber,
            supplierReference: p.invoice.supplierReference || null,
            amount: p.invoice.amount?.toString?.() ?? "",
          }
        : null,
      procurement: p.procurement
        ? { id: p.procurement.id, number: p.procurement.procurementNumber, title: p.procurement.title || null }
        : null,
    })),
  };
}

/**
 * @param {{ projectId: string; providerId: string; event: "login" | "logout"; ip?: string | null; userAgent?: string | null }} opts
 */
export async function auditProviderPortalAccess(opts) {
  await writeAuditLog({
    eventType:
      opts.event === "login"
        ? AuditEvent.PROJECT_ORG_PROVIDER_PORTAL_LOGIN
        : AuditEvent.PROJECT_ORG_PROVIDER_PORTAL_LOGOUT,
    actorUserId: null,
    ip: opts.ip ?? null,
    userAgent: opts.userAgent ?? null,
    meta: { projectId: opts.projectId, providerId: opts.providerId, method: "provider_portal" },
  });
}
