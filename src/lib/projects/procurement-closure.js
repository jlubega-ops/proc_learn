import {
  OrgAwardStatus,
  OrgContractStatus,
  OrgInspectionStatus,
  OrgInvoiceStatus,
  OrgLpoStatus,
  OrgPaymentStatus,
  OrgProcurementMethod,
  OrgProcurementStatus,
  OrgPurchaseInstructionStatus,
} from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyOrgUsers, OrgNotificationType } from "@/lib/projects/org-notifications";

/**
 * Full lifecycle gate checks before a procurement can be marked CLOSED.
 *
 * All methods (including Micro once past the order document) require:
 * - active order (issued Purchase Instruction, accepted LPO, or active contract)
 * - at least one accepted/partial inspection on a delivery
 * - at least one verified invoice
 * - payments covering the verified invoice total
 *
 * Quotation/Tender additionally require an accepted award before the order document.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
export async function evaluateClosureReadiness(prisma, projectId, procurementId) {
  const procurement = await prisma.projectOrgProcurement.findFirst({
    where: { id: procurementId, projectId },
    include: {
      purchaseInstructions: true,
      awards: true,
      contracts: true,
      lpos: true,
      deliveries: { include: { inspection: true } },
      invoices: true,
      payments: true,
    },
  });
  if (!procurement) return { ok: false, error: "Procurement not found in this organisation.", status: 404 };

  if (procurement.status === OrgProcurementStatus.CLOSED) {
    return { ok: false, error: "This procurement is already closed.", status: 400, code: "ALREADY_CLOSED" };
  }
  if ([OrgProcurementStatus.CANCELLED, OrgProcurementStatus.REJECTED].includes(procurement.status)) {
    return { ok: false, error: "A cancelled or rejected procurement cannot be closed.", status: 400 };
  }

  /** @type {string[]} */
  const blockers = [];

  if (procurement.procurementMethod === OrgProcurementMethod.MICRO) {
    const statuses = procurement.purchaseInstructions.map((pi) => pi.status);
    if (!statuses.includes(OrgPurchaseInstructionStatus.ACCEPTED)) {
      blockers.push(
        statuses.includes(OrgPurchaseInstructionStatus.ISSUED)
          ? "The purchase instruction must be accepted by the supplier."
          : "Issue a purchase instruction before closing this Micro Procurement.",
      );
    }
  } else {
    const acceptedAward = procurement.awards.find((a) => a.status === OrgAwardStatus.ACCEPTED);
    if (!acceptedAward) blockers.push("The award must be accepted by the supplier.");

    const hasActiveOrder =
      procurement.contracts.some((c) => c.status === OrgContractStatus.ACTIVE) ||
      procurement.lpos.some((l) => l.status === OrgLpoStatus.ACCEPTED);
    if (!hasActiveOrder) {
      blockers.push(
        procurement.procurementMethod === OrgProcurementMethod.TENDER
          ? "Issue the contract and have the supplier accept it before closing."
          : "Issue and accept the LPO before closing.",
      );
    }
  }

  // Delivery / invoice / payment apply to all methods once past the order document.
  const acceptedDelivery = procurement.deliveries.some((d) =>
    d.inspection &&
      [OrgInspectionStatus.ACCEPTED, OrgInspectionStatus.PARTIAL].includes(d.inspection.status),
  );
  if (!acceptedDelivery) blockers.push("Record and pass inspection on at least one delivery.");

  const verifiedInvoices = procurement.invoices.filter((i) =>
    [OrgInvoiceStatus.VERIFIED, OrgInvoiceStatus.APPROVED_FOR_PAYMENT].includes(i.status),
  );
  if (verifiedInvoices.length === 0) blockers.push("Certify and verify at least one invoice.");

  const totalInvoiced = verifiedInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0);
  const totalPaid = procurement.payments
    .filter((p) => p.status === OrgPaymentStatus.PAID)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  if (verifiedInvoices.length > 0 && totalPaid + 0.009 < totalInvoiced) {
    blockers.push(`Full payment is outstanding (paid ${totalPaid.toFixed(2)} of ${totalInvoiced.toFixed(2)}).`);
  }

  return { ok: blockers.length === 0, blockers, procurement };
}

/**
 * Close a procurement once every lifecycle gate has been satisfied.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   remarks?: string | null;
 * }} opts
 */
export async function closeProcurement(prisma, opts) {
  const readiness = await evaluateClosureReadiness(prisma, opts.projectId, opts.procurementId);
  if (!readiness.procurement) return { ok: false, error: readiness.error, status: readiness.status || 404 };
  if (!readiness.ok) {
    return {
      ok: false,
      error: `This procurement cannot be closed yet: ${readiness.blockers.join(" ")}`,
      status: 400,
      code: "CLOSURE_GATE_FAILED",
      blockers: readiness.blockers,
    };
  }

  const updated = await prisma.projectOrgProcurement.update({
    where: { id: opts.procurementId },
    data: {
      status: OrgProcurementStatus.CLOSED,
      closedAt: new Date(),
      closedByOrgUserId: opts.actorOrgUserId,
      closureRemarks: typeof opts.remarks === "string" ? opts.remarks.trim() || null : null,
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROCUREMENT_CLOSED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      remarks: opts.remarks || null,
    },
  });

  const requesterId = await prisma.projectOrgProcurement.findUnique({
    where: { id: opts.procurementId },
    select: { requisition: { select: { requesterOrgUserId: true } } },
  });
  if (requesterId?.requisition?.requesterOrgUserId) {
    const requester = await prisma.projectOrgUser.findUnique({
      where: { id: requesterId.requisition.requesterOrgUserId },
      select: { id: true, linkedUserId: true },
    });
    if (requester) {
      await notifyOrgUsers(prisma, {
        projectId: opts.projectId,
        recipients: [requester],
        type: OrgNotificationType.WORKFLOW_APPROVED,
        title: "Procurement closed",
        body: `${opts.actorRoleName || "Procurement Officer"} closed this procurement. The lifecycle is complete.`,
        linkUrl: `/projects/${opts.projectId}/procurements/${opts.procurementId}`,
        relatedEntityType: "procurement",
        relatedEntityId: opts.procurementId,
      });
    }
  }

  return { ok: true, procurement: updated };
}
