import { OrgInvoiceStatus, OrgProcurementStatus, Prisma } from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { getActiveOrderValue } from "@/lib/projects/contracts-lpo";
import { hasAcceptedDelivery } from "@/lib/projects/deliveries";
import { WORKFLOW_TRIGGERS } from "@/lib/projects/process-catalogue";
import { startWorkflowFromTrigger } from "@/lib/projects/workflow-engine";
import { serializeProviderSummary } from "@/lib/projects/providers";
import { notifyOrgUsers, OrgNotificationType } from "@/lib/projects/org-notifications";
import { notifyProvider } from "@/lib/projects/provider-notifications";

/** @param {any} row */
export function serializeInvoice(row) {
  if (!row) return null;
  return {
    id: row.id,
    procurementId: row.procurementId,
    deliveryId: row.deliveryId || null,
    invoiceNumber: row.invoiceNumber,
    amount: row.amount?.toString?.() ?? String(row.amount ?? ""),
    status: row.status,
    source: row.source || "OFFICER",
    supplierId: row.supplierId || null,
    supplier: row.supplier ? serializeProviderSummary(row.supplier) : null,
    supplierReference: row.supplierReference || null,
    deliveryAddress: row.deliveryAddress || null,
    notes: row.notes || null,
    invoiceDate: row.invoiceDate || null,
    certifiedAt: row.certifiedAt || null,
    verifiedAt: row.verifiedAt || null,
    rejectionReason: row.rejectionReason || null,
    createdBy: row.createdBy
      ? { id: row.createdBy.id, displayName: `${row.createdBy.firstName || ""} ${row.createdBy.lastName || ""}`.trim() }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const invoiceInclude = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  supplier: true,
};

export const INVOICE_SOURCE = Object.freeze({ OFFICER: "OFFICER", PORTAL: "PORTAL", AUTO: "AUTO" });

const NON_CANCELLED_INVOICE_STATUSES = [
  OrgInvoiceStatus.RECEIVED,
  OrgInvoiceStatus.CERTIFIED,
  OrgInvoiceStatus.VERIFIED,
  OrgInvoiceStatus.APPROVED_FOR_PAYMENT,
];

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
async function nextInvoiceNumber(prisma, projectId, procurementId) {
  const proc = await prisma.projectOrgProcurement.findUnique({
    where: { id: procurementId },
    select: { procurementNumber: true },
  });
  const prefix = `INV-${proc?.procurementNumber || "PROC"}-`;
  const rows = await prisma.projectOrgInvoice.findMany({
    where: { projectId, invoiceNumber: { startsWith: prefix } },
    select: { invoiceNumber: true },
  });
  let max = 0;
  for (const row of rows) {
    const m = String(row.invoiceNumber || "").match(/-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/**
 * Create an invoice against a procurement's active order. Requires at least one
 * accepted delivery, and the running total of invoices must not exceed the order
 * value (Purchase Instruction amount, LPO value, or contract value).
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   actorOrgUserId: string | null;
 *   actorRoleName: string;
 *   amount: string | number;
 *   invoiceDate?: string | Date | null;
 *   deliveryId?: string | null;
 *   source?: "OFFICER" | "PORTAL" | "AUTO";
 *   supplierReference?: string | null;
 *   notes?: string | null;
 *   portalProviderId?: string | null;
 * }} opts
 */
export async function createInvoice(prisma, opts) {
  const source = Object.values(INVOICE_SOURCE).includes(opts.source) ? opts.source : INVOICE_SOURCE.OFFICER;
  const procurement = await prisma.projectOrgProcurement.findFirst({
    where: { id: opts.procurementId, projectId: opts.projectId },
  });
  if (!procurement) return { ok: false, error: "Procurement not found in this organisation.", status: 404 };

  const delivered = await hasAcceptedDelivery(prisma, opts.projectId, procurement.id);
  if (!delivered) {
    return {
      ok: false,
      error: "Record and pass inspection on a delivery before raising an invoice.",
      status: 400,
      code: "NO_ACCEPTED_DELIVERY",
    };
  }

  const order = await getActiveOrderValue(prisma, opts.projectId, procurement.id);
  if (!order) {
    return {
      ok: false,
      error: "No active order (Purchase Instruction, LPO, or contract) was found for this procurement.",
      status: 400,
      code: "NO_ACTIVE_ORDER",
    };
  }
  if (opts.portalProviderId && order.supplierId !== opts.portalProviderId) {
    return { ok: false, error: "This order was not issued to your organisation.", status: 403 };
  }

  const supplierReference =
    typeof opts.supplierReference === "string" ? opts.supplierReference.trim().slice(0, 64) || null : null;
  const notes = typeof opts.notes === "string" ? opts.notes.trim().slice(0, 2000) || null : null;

  const amount = Number(String(opts.amount ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a valid invoice amount.", status: 400, fieldErrors: { amount: "Enter a valid amount." } };
  }

  const existing = await prisma.projectOrgInvoice.findMany({
    where: { projectId: opts.projectId, procurementId: procurement.id, status: { in: NON_CANCELLED_INVOICE_STATUSES } },
    select: { amount: true },
  });
  const alreadyInvoiced = existing.reduce((sum, i) => sum + Number(i.amount || 0), 0);
  if (alreadyInvoiced + amount > order.value + 0.009) {
    return {
      ok: false,
      error: `Invoice amount exceeds the order value. Already invoiced ${alreadyInvoiced.toFixed(2)} of ${order.value.toFixed(2)}.`,
      status: 400,
      code: "EXCEEDS_ORDER_VALUE",
    };
  }

  const invoiceNumber = await nextInvoiceNumber(prisma, opts.projectId, procurement.id);
  let deliveryId = typeof opts.deliveryId === "string" ? opts.deliveryId.trim() || null : null;
  let deliveryAddress = order.deliveryAddress || null;
  if (!deliveryId) {
    const latestAccepted = await prisma.projectOrgDelivery.findFirst({
      where: {
        projectId: opts.projectId,
        procurementId: procurement.id,
        inspection: { status: { in: ["ACCEPTED", "PARTIAL"] } },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, deliveryAddress: true },
    });
    if (latestAccepted) {
      deliveryId = latestAccepted.id;
      deliveryAddress = latestAccepted.deliveryAddress || deliveryAddress;
    }
  } else {
    const delivery = await prisma.projectOrgDelivery.findFirst({
      where: { id: deliveryId, projectId: opts.projectId, procurementId: procurement.id },
      include: { inspection: true },
    });
    if (!delivery) {
      return {
        ok: false,
        error: "The selected delivery does not belong to this procurement.",
        status: 400,
        fieldErrors: { deliveryId: "Choose a delivery for this procurement." },
      };
    }
    if (
      !delivery.inspection ||
      !["ACCEPTED", "PARTIAL"].includes(delivery.inspection.status)
    ) {
      return {
        ok: false,
        error: "Link the invoice to a delivery that has passed inspection (accepted or partially accepted).",
        status: 400,
        fieldErrors: { deliveryId: "Delivery must be accepted or partially accepted." },
      };
    }
    deliveryAddress = delivery.deliveryAddress || deliveryAddress;
  }

  const row = await prisma.projectOrgInvoice.create({
    data: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      deliveryId,
      invoiceNumber,
      amount: new Prisma.Decimal(amount.toFixed(2)),
      status: OrgInvoiceStatus.RECEIVED,
      invoiceDate: opts.invoiceDate ? new Date(opts.invoiceDate) : new Date(),
      createdByOrgUserId: opts.actorOrgUserId || null,
      supplierId: order.supplierId || null,
      supplierReference,
      source,
      deliveryAddress,
      notes,
    },
    include: invoiceInclude,
  });

  await prisma.projectOrgProcurement.update({
    where: { id: procurement.id },
    data: { status: OrgProcurementStatus.INVOICING },
  });

  await writeAuditLog({
    eventType:
      source === INVOICE_SOURCE.OFFICER
        ? AuditEvent.PROJECT_ORG_INVOICE_CREATED
        : AuditEvent.PROJECT_ORG_INVOICE_RECEIVED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      invoiceId: row.id,
      invoiceNumber,
      amount: amount.toFixed(2),
      orderValue: order.value.toFixed(2),
      supplierId: order.supplierId || null,
      source,
      actorOrgUserId: opts.actorOrgUserId || null,
      actorRoleName: opts.actorRoleName,
    },
  });

  const workflowActorId = opts.actorOrgUserId || procurement.officerOrgUserId || null;
  if (workflowActorId) {
    try {
      await startWorkflowFromTrigger(prisma, {
        projectId: opts.projectId,
        triggerKey: WORKFLOW_TRIGGERS.INVOICE_STARTED,
        entityType: "procurement",
        entityId: procurement.id,
        procurementId: procurement.id,
        entityTitle: `Invoice: ${invoiceNumber}`,
        actorOrgUserId: workflowActorId,
        actorRoleName: opts.actorRoleName,
      });
    } catch {
      // Best-effort tracking workflow.
    }
  }

  if (source !== INVOICE_SOURCE.OFFICER && procurement.officerOrgUserId) {
    const officer = await prisma.projectOrgUser.findUnique({
      where: { id: procurement.officerOrgUserId },
      select: { id: true, linkedUserId: true },
    });
    if (officer) {
      await notifyOrgUsers(prisma, {
        projectId: opts.projectId,
        recipients: [officer],
        type: OrgNotificationType.WORKFLOW_TASK,
        title: `Invoice received: ${invoiceNumber}`,
        body: `${row.supplier?.name || "The provider"} submitted an invoice of ${amount.toFixed(2)} for ${procurement.procurementNumber}.`,
        linkUrl: `/projects/${opts.projectId}/procurements/${procurement.id}`,
        relatedEntityType: "invoice",
        relatedEntityId: row.id,
      });
    }
  }

  return { ok: true, invoice: serializeInvoice(row), order };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; invoiceId: string; actorOrgUserId: string; actorRoleName: string }} opts
 */
export async function certifyInvoice(prisma, opts) {
  const row = await prisma.projectOrgInvoice.findFirst({ where: { id: opts.invoiceId, projectId: opts.projectId } });
  if (!row) return { ok: false, error: "Invoice not found.", status: 404 };
  if (row.status !== OrgInvoiceStatus.RECEIVED) {
    return { ok: false, error: "Only a received invoice can be certified.", status: 400 };
  }
  const updated = await prisma.projectOrgInvoice.update({
    where: { id: row.id },
    data: { status: OrgInvoiceStatus.CERTIFIED, certifiedAt: new Date() },
    include: invoiceInclude,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_INVOICE_CERTIFIED,
    actorUserId: null,
    meta: { projectId: opts.projectId, procurementId: row.procurementId, invoiceId: row.id, actorOrgUserId: opts.actorOrgUserId, actorRoleName: opts.actorRoleName },
  });

  return { ok: true, invoice: serializeInvoice(updated) };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; invoiceId: string; actorOrgUserId: string; actorRoleName: string }} opts
 */
export async function verifyInvoice(prisma, opts) {
  const row = await prisma.projectOrgInvoice.findFirst({ where: { id: opts.invoiceId, projectId: opts.projectId } });
  if (!row) return { ok: false, error: "Invoice not found.", status: 404 };
  if (row.status !== OrgInvoiceStatus.CERTIFIED) {
    return { ok: false, error: "The invoice must be certified before it can be verified.", status: 400 };
  }
  const updated = await prisma.projectOrgInvoice.update({
    where: { id: row.id },
    data: { status: OrgInvoiceStatus.VERIFIED, verifiedAt: new Date() },
    include: invoiceInclude,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_INVOICE_VERIFIED,
    actorUserId: null,
    meta: { projectId: opts.projectId, procurementId: row.procurementId, invoiceId: row.id, actorOrgUserId: opts.actorOrgUserId, actorRoleName: opts.actorRoleName },
  });

  await notifyProvider(prisma, {
    projectId: opts.projectId,
    providerId: row.supplierId,
    procurementId: row.procurementId,
    title: `Invoice verified: ${row.invoiceNumber}`,
    body: "Your invoice has been verified and is going for payment.",
  });

  return { ok: true, invoice: serializeInvoice(updated) };
}

/**
 * Reject a received/certified invoice (requires reason).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   invoiceId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   reason: string;
 * }} opts
 */
export async function rejectInvoice(prisma, opts) {
  const row = await prisma.projectOrgInvoice.findFirst({
    where: { id: opts.invoiceId, projectId: opts.projectId },
  });
  if (!row) return { ok: false, error: "Invoice not found.", status: 404 };
  if (![OrgInvoiceStatus.RECEIVED, OrgInvoiceStatus.CERTIFIED].includes(row.status)) {
    return {
      ok: false,
      error: "Only a received or certified invoice can be rejected.",
      status: 400,
    };
  }
  const reason = typeof opts.reason === "string" ? opts.reason.trim() : "";
  if (!reason) {
    return {
      ok: false,
      error: "Provide a reason when rejecting an invoice.",
      status: 400,
      fieldErrors: { reason: "Enter a rejection reason." },
    };
  }

  const updated = await prisma.projectOrgInvoice.update({
    where: { id: row.id },
    data: { status: OrgInvoiceStatus.REJECTED, rejectionReason: reason },
    include: invoiceInclude,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_INVOICE_REJECTED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: row.procurementId,
      invoiceId: row.id,
      reason,
      previousStatus: row.status,
      newStatus: OrgInvoiceStatus.REJECTED,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  await notifyProvider(prisma, {
    projectId: opts.projectId,
    providerId: row.supplierId,
    procurementId: row.procurementId,
    title: `Invoice rejected: ${row.invoiceNumber}`,
    body: `Reason: ${reason}`,
  });

  return { ok: true, invoice: serializeInvoice(updated) };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
export async function listInvoices(prisma, projectId, procurementId) {
  const rows = await prisma.projectOrgInvoice.findMany({
    where: { projectId, procurementId },
    orderBy: { createdAt: "asc" },
    include: invoiceInclude,
  });
  return rows.map(serializeInvoice);
}
