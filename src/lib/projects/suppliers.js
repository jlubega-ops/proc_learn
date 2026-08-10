import { OrgSupplierStatus } from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";

/**
 * @param {any} row
 */
export function serializeSupplier(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email || null,
    phone: row.phone || null,
    registrationRef: row.registrationRef || null,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * List suppliers for a project workspace. No fake / auto-generated suppliers —
 * this is only ever what organisation users have deliberately registered.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; status?: string | null; search?: string | null }} opts
 */
export async function listSuppliers(prisma, opts) {
  /** @type {Record<string, unknown>} */
  const where = { projectId: opts.projectId };
  if (opts.status && Object.prototype.hasOwnProperty.call(OrgSupplierStatus, opts.status)) {
    where.status = opts.status;
  }
  const search = String(opts.search || "").trim();
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { registrationRef: { contains: search } },
    ];
  }

  const rows = await prisma.projectOrgSupplier.findMany({
    where,
    orderBy: [{ name: "asc" }],
  });
  return rows.map(serializeSupplier);
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} supplierId
 */
export async function getSupplier(prisma, projectId, supplierId) {
  const row = await prisma.projectOrgSupplier.findFirst({
    where: { id: supplierId, projectId },
  });
  return row ? serializeSupplier(row) : null;
}

/**
 * Register a new supplier for the organisation. Suppliers are deliberately
 * created by organisation users — the simulation never fabricates them.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   body: any;
 * }} opts
 */
export async function createSupplier(prisma, opts) {
  const b = opts.body || {};
  /** @type {Record<string, string>} */
  const fieldErrors = {};

  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const phone = typeof b.phone === "string" ? b.phone.trim() : "";
  const registrationRef =
    typeof b.registrationRef === "string" ? b.registrationRef.trim() || null : null;

  if (!name) fieldErrors.name = "Enter the supplier's registered name.";
  if (email && !EMAIL_RE.test(email)) fieldErrors.email = "Enter a valid email address.";

  if (Object.keys(fieldErrors).length) {
    return { ok: false, fieldErrors, error: "Please fix the highlighted fields." };
  }

  const existing = await prisma.projectOrgSupplier.findFirst({
    where: { projectId: opts.projectId, name },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      error: "A supplier with this name is already registered in this organisation.",
      status: 400,
      fieldErrors: { name: "This supplier name is already registered." },
      code: "SUPPLIER_NAME_TAKEN",
    };
  }

  const row = await prisma.projectOrgSupplier.create({
    data: {
      projectId: opts.projectId,
      name,
      email: email || null,
      phone: phone || null,
      registrationRef,
      status: OrgSupplierStatus.ACTIVE,
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_SUPPLIER_CREATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      supplierId: row.id,
      name: row.name,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true, supplier: serializeSupplier(row) };
}

/**
 * Find a supplier by exact registered name, or register it inline. Used when a
 * procurement step accepts either an existing supplier id or a fresh supplier
 * payload (e.g. issuing a purchase instruction, inviting a new bidder).
 * Unlike {@link createSupplier}, this never fails on a name that already
 * exists — it simply reuses that supplier record.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   body: any;
 * }} opts
 */
export async function createOrGetSupplier(prisma, opts) {
  const b = opts.body || {};
  /** @type {Record<string, string>} */
  const fieldErrors = {};

  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const phone = typeof b.phone === "string" ? b.phone.trim() : "";
  const registrationRef =
    typeof b.registrationRef === "string" ? b.registrationRef.trim() || null : null;

  if (!name) fieldErrors.name = "Enter the supplier's registered name.";
  if (email && !EMAIL_RE.test(email)) fieldErrors.email = "Enter a valid email address.";

  if (Object.keys(fieldErrors).length) {
    return { ok: false, fieldErrors, error: "Please fix the highlighted fields." };
  }

  const existing = await prisma.projectOrgSupplier.findFirst({
    where: { projectId: opts.projectId, name },
  });
  if (existing) {
    return { ok: true, supplier: serializeSupplier(existing), created: false };
  }

  const row = await prisma.projectOrgSupplier.create({
    data: {
      projectId: opts.projectId,
      name,
      email: email || null,
      phone: phone || null,
      registrationRef,
      status: OrgSupplierStatus.ACTIVE,
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_SUPPLIER_CREATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      supplierId: row.id,
      name: row.name,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      inline: true,
    },
  });

  return { ok: true, supplier: serializeSupplier(row), created: true };
}
