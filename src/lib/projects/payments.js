import { OrgInvoiceStatus, OrgPaymentStatus, OrgProcurementStatus, Prisma } from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyOrgUsers, OrgNotificationType } from "@/lib/projects/org-notifications";
import { WORKFLOW_TRIGGERS } from "@/lib/projects/process-catalogue";
import { startWorkflowFromTrigger } from "@/lib/projects/workflow-engine";

/** @param {any} row */
export function serializePayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    procurementId: row.procurementId,
    invoiceId: row.invoiceId,
    amount: row.amount?.toString?.() ?? String(row.amount ?? ""),
    status: row.status,
    paymentReference: row.paymentReference || null,
    paymentDate: row.paymentDate || null,
    approvedBy: row.approvedBy
      ? { id: row.approvedBy.id, displayName: `${row.approvedBy.firstName || ""} ${row.approvedBy.lastName || ""}`.trim() }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const paymentInclude = { approvedBy: { select: { id: true, firstName: true, lastName: true } } };

/**
 * Sum of non-cancelled/rejected payments already recorded against an invoice.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} invoiceId
 */
async function invoicePaidOrPendingTotal(prisma, invoiceId) {
  const rows = await prisma.projectOrgPayment.findMany({
    where: { invoiceId, status: { in: [OrgPaymentStatus.PENDING, OrgPaymentStatus.APPROVED, OrgPaymentStatus.PAID] } },
    select: { amount: true },
  });
  return rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
}

/**
 * Create a PENDING payment against a VERIFIED (or already approved-for-payment) invoice.
 * The amount must not exceed the invoice's remaining (unpaid) balance.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   invoiceId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   amount: string | number;
 *   paymentReference?: string | null;
 * }} opts
 */
export async function createPayment(prisma, opts) {
  const invoice = await prisma.projectOrgInvoice.findFirst({
    where: { id: opts.invoiceId, projectId: opts.projectId, procurementId: opts.procurementId },
  });
  if (!invoice) return { ok: false, error: "Invoice not found for this procurement.", status: 404 };
  if (![OrgInvoiceStatus.VERIFIED, OrgInvoiceStatus.APPROVED_FOR_PAYMENT].includes(invoice.status)) {
    return {
      ok: false,
      error: "The invoice must be verified before a payment can be raised against it.",
      status: 400,
      code: "INVOICE_NOT_VERIFIED",
    };
  }

  const amount = Number(opts.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a valid payment amount.", status: 400, fieldErrors: { amount: "Enter a valid amount." } };
  }

  const already = await invoicePaidOrPendingTotal(prisma, invoice.id);
  const remaining = Number(invoice.amount) - already;
  if (amount > remaining + 0.009) {
    return {
      ok: false,
      error: `Payment amount exceeds the invoice's remaining balance (${remaining.toFixed(2)}).`,
      status: 400,
      code: "EXCEEDS_INVOICE_REMAINING",
    };
  }

  const row = await prisma.projectOrgPayment.create({
    data: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      invoiceId: invoice.id,
      amount: new Prisma.Decimal(amount.toFixed(2)),
      status: OrgPaymentStatus.PENDING,
      paymentReference: typeof opts.paymentReference === "string" ? opts.paymentReference.trim() || null : null,
    },
    include: paymentInclude,
  });

  await prisma.projectOrgProcurement.update({
    where: { id: opts.procurementId },
    data: { status: OrgProcurementStatus.PAYMENT },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PAYMENT_RECORDED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      invoiceId: invoice.id,
      paymentId: row.id,
      amount: amount.toFixed(2),
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  try {
    await startWorkflowFromTrigger(prisma, {
      projectId: opts.projectId,
      triggerKey: WORKFLOW_TRIGGERS.PAYMENT_STARTED,
      entityType: "procurement",
      entityId: opts.procurementId,
      procurementId: opts.procurementId,
      entityTitle: `Payment against ${invoice.invoiceNumber}`,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
  } catch {
    // Best-effort tracking workflow.
  }

  return { ok: true, payment: serializePayment(row) };
}

/**
 * Approve a PENDING payment. Marks the invoice APPROVED_FOR_PAYMENT.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; paymentId: string; actorOrgUserId: string; actorRoleName: string }} opts
 */
export async function approvePayment(prisma, opts) {
  const row = await prisma.projectOrgPayment.findFirst({ where: { id: opts.paymentId, projectId: opts.projectId } });
  if (!row) return { ok: false, error: "Payment not found.", status: 404 };
  if (row.status !== OrgPaymentStatus.PENDING) {
    return { ok: false, error: "Only a pending payment can be approved.", status: 400 };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.projectOrgPayment.update({
      where: { id: row.id },
      data: { status: OrgPaymentStatus.APPROVED, approvedByOrgUserId: opts.actorOrgUserId },
      include: paymentInclude,
    });
    await tx.projectOrgInvoice.update({
      where: { id: row.invoiceId },
      data: { status: OrgInvoiceStatus.APPROVED_FOR_PAYMENT },
    });
    return p;
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PAYMENT_APPROVED,
    actorUserId: null,
    meta: { projectId: opts.projectId, procurementId: row.procurementId, paymentId: row.id, actorOrgUserId: opts.actorOrgUserId, actorRoleName: opts.actorRoleName },
  });

  return { ok: true, payment: serializePayment(updated) };
}

/**
 * Mark an APPROVED payment as PAID. When it fully settles the invoice, the
 * procurement advances to READY_FOR_CLOSURE.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; paymentId: string; actorOrgUserId: string; actorRoleName: string; paymentDate?: string | Date | null }} opts
 */
export async function markPaymentPaid(prisma, opts) {
  const row = await prisma.projectOrgPayment.findFirst({ where: { id: opts.paymentId, projectId: opts.projectId } });
  if (!row) return { ok: false, error: "Payment not found.", status: 404 };
  if (row.status !== OrgPaymentStatus.APPROVED) {
    return { ok: false, error: "The payment must be approved before it can be marked paid.", status: 400 };
  }

  const updated = await prisma.projectOrgPayment.update({
    where: { id: row.id },
    data: { status: OrgPaymentStatus.PAID, paymentDate: opts.paymentDate ? new Date(opts.paymentDate) : new Date() },
    include: paymentInclude,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PAYMENT_PAID,
    actorUserId: null,
    meta: { projectId: opts.projectId, procurementId: row.procurementId, paymentId: row.id, actorOrgUserId: opts.actorOrgUserId, actorRoleName: opts.actorRoleName },
  });

  const invoice = await prisma.projectOrgInvoice.findUnique({ where: { id: row.invoiceId } });
  const paidTotal = await prisma.projectOrgPayment.aggregate({
    where: { invoiceId: row.invoiceId, status: OrgPaymentStatus.PAID },
    _sum: { amount: true },
  });
  const invoiceFullyPaid = invoice && Number(paidTotal._sum.amount || 0) + 0.009 >= Number(invoice.amount);

  // READY_FOR_CLOSURE only when every verified/approved invoice is fully paid (not just this one).
  let procurementReadyForClosure = false;
  if (invoiceFullyPaid) {
    const openInvoices = await prisma.projectOrgInvoice.findMany({
      where: {
        procurementId: row.procurementId,
        status: {
          in: [OrgInvoiceStatus.VERIFIED, OrgInvoiceStatus.APPROVED_FOR_PAYMENT],
        },
      },
      select: { id: true, amount: true },
    });
    let allSettled = openInvoices.length > 0;
    for (const inv of openInvoices) {
      const paid = await prisma.projectOrgPayment.aggregate({
        where: { invoiceId: inv.id, status: OrgPaymentStatus.PAID },
        _sum: { amount: true },
      });
      if (Number(paid._sum.amount || 0) + 0.009 < Number(inv.amount)) {
        allSettled = false;
        break;
      }
    }
    // Also wait until no invoice remains only CERTIFIED/RECEIVED (financial obligation incomplete).
    const unfinished = await prisma.projectOrgInvoice.count({
      where: {
        procurementId: row.procurementId,
        status: { in: [OrgInvoiceStatus.RECEIVED, OrgInvoiceStatus.CERTIFIED] },
      },
    });
    if (allSettled && unfinished === 0) {
      procurementReadyForClosure = true;
      await prisma.projectOrgProcurement.update({
        where: { id: row.procurementId },
        data: { status: OrgProcurementStatus.READY_FOR_CLOSURE },
      });
      const officer = await prisma.projectOrgProcurement.findUnique({
        where: { id: row.procurementId },
        select: { officer: { select: { id: true, linkedUserId: true } } },
      });
      if (officer?.officer) {
        await notifyOrgUsers(prisma, {
          projectId: opts.projectId,
          recipients: [officer.officer],
          type: OrgNotificationType.WORKFLOW_APPROVED,
          title: "Ready for closure",
          body: "Payment is complete. This procurement is ready to be closed.",
          linkUrl: `/projects/${opts.projectId}/procurements/${row.procurementId}`,
          relatedEntityType: "procurement",
          relatedEntityId: row.procurementId,
        });
      }
    }
  }

  return { ok: true, payment: serializePayment(updated), procurementReadyForClosure };
}

/**
 * Reject a PENDING payment (requires reason).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   paymentId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   reason: string;
 * }} opts
 */
export async function rejectPayment(prisma, opts) {
  const row = await prisma.projectOrgPayment.findFirst({
    where: { id: opts.paymentId, projectId: opts.projectId },
  });
  if (!row) return { ok: false, error: "Payment not found.", status: 404 };
  if (row.status !== OrgPaymentStatus.PENDING) {
    return { ok: false, error: "Only a pending payment can be rejected.", status: 400 };
  }
  const reason = typeof opts.reason === "string" ? opts.reason.trim() : "";
  if (!reason) {
    return {
      ok: false,
      error: "Provide a reason when rejecting a payment.",
      status: 400,
      fieldErrors: { reason: "Enter a rejection reason." },
    };
  }

  const updated = await prisma.projectOrgPayment.update({
    where: { id: row.id },
    data: { status: OrgPaymentStatus.REJECTED },
    include: paymentInclude,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PAYMENT_REJECTED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: row.procurementId,
      paymentId: row.id,
      reason,
      previousStatus: row.status,
      newStatus: OrgPaymentStatus.REJECTED,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true, payment: serializePayment(updated) };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
export async function listPayments(prisma, projectId, procurementId) {
  const rows = await prisma.projectOrgPayment.findMany({
    where: { projectId, procurementId },
    orderBy: { createdAt: "asc" },
    include: paymentInclude,
  });
  return rows.map(serializePayment);
}
