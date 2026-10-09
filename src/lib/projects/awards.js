import {
  OrgAwardStatus,
  OrgEvaluationReportStatus,
  OrgProcurementStatus,
  OrgWorkflowInstanceStatus,
  OrgWorkflowTaskStatus,
} from "@prisma/client";
import { validatePurchaseInstructionResponse } from "@/lib/validation/purchase-instruction";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyOrgUsers, OrgNotificationType } from "@/lib/projects/org-notifications";
import { notifyProvider } from "@/lib/projects/provider-notifications";
import { formatMoneyUGX } from "@/lib/money";
import { postQualificationRequired } from "@/lib/projects/post-qualification";
import { serializeProviderSummary } from "@/lib/projects/providers";

/**
 * @param {any} row
 */
export function serializeAward(row) {
  if (!row) return null;
  return {
    id: row.id,
    procurementId: row.procurementId,
    supplierId: row.supplierId,
    supplier: row.supplier ? serializeProviderSummary(row.supplier) : null,
    awardedAmount: row.awardedAmount?.toString?.() ?? String(row.awardedAmount ?? ""),
    status: row.status,
    awardDate: row.awardDate || null,
    communicatedAt: row.communicatedAt || null,
    acceptedAt: row.acceptedAt || null,
    acceptedByName: row.acceptedByName || null,
    declinedAt: row.declinedAt || null,
    declineReason: row.declineReason || null,
    approvalReference: row.approvalReference || null,
    approvedBy: row.approvedBy
      ? {
          id: row.approvedBy.id,
          displayName: `${row.approvedBy.firstName || ""} ${row.approvedBy.lastName || ""}`.trim(),
        }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const awardInclude = {
  supplier: true,
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
};

/**
 * Create (and approve, since the acting user carries final approval authority) an
 * award record from an already-APPROVED evaluation report, with any required
 * post-qualification also APPROVED.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   approvalReference?: string | null;
 * }} opts
 */
export async function createAwardFromApprovedEvaluation(prisma, opts) {
  const procurement = await prisma.projectOrgProcurement.findFirst({
    where: { id: opts.procurementId, projectId: opts.projectId },
  });
  if (!procurement) return { ok: false, error: "Procurement not found in this organisation.", status: 404 };

  const existingActive = await prisma.projectOrgAward.findFirst({
    where: { projectId: opts.projectId, procurementId: procurement.id, status: { not: OrgAwardStatus.CANCELLED } },
  });
  if (existingActive) {
    return {
      ok: false,
      error: "An award has already been created for this procurement.",
      status: 400,
      code: "AWARD_ALREADY_EXISTS",
    };
  }

  const evaluation = await prisma.projectOrgEvaluationReport.findFirst({
    where: { projectId: opts.projectId, procurementId: procurement.id, status: OrgEvaluationReportStatus.APPROVED },
    orderBy: { approvedAt: "desc" },
  });
  if (!evaluation || !evaluation.recommendedSupplierId || evaluation.evaluatedAmount == null) {
    return {
      ok: false,
      error: "An approved evaluation report with a recommended supplier and amount is required before award.",
      status: 400,
      code: "NO_APPROVED_EVALUATION",
    };
  }

  if (postQualificationRequired(procurement)) {
    const pq = await prisma.projectOrgPostQualificationReport.findFirst({
      where: {
        projectId: opts.projectId,
        procurementId: procurement.id,
        status: "APPROVED",
        supplierId: evaluation.recommendedSupplierId,
      },
      orderBy: { approvedAt: "desc" },
    });
    if (!pq) {
      return {
        ok: false,
        error:
          "This procurement requires post-qualification. Complete and approve a post-qualification checklist for the recommended supplier before award.",
        status: 400,
        code: "PQ_REQUIRED",
      };
    }
  }

  const row = await prisma.$transaction(async (tx) => {
    const award = await tx.projectOrgAward.create({
      data: {
        projectId: opts.projectId,
        procurementId: procurement.id,
        supplierId: evaluation.recommendedSupplierId,
        awardedAmount: evaluation.evaluatedAmount,
        status: OrgAwardStatus.APPROVED,
        awardDate: new Date(),
        approvalReference:
          typeof opts.approvalReference === "string" ? opts.approvalReference.trim().slice(0, 128) || null : null,
        approvedByOrgUserId: opts.actorOrgUserId,
      },
      include: awardInclude,
    });
    await tx.projectOrgProcurement.update({
      where: { id: procurement.id },
      data: { status: OrgProcurementStatus.AWARDED },
    });
    return award;
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_AWARD_CREATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      awardId: row.id,
      supplierId: row.supplierId,
      awardedAmount: row.awardedAmount?.toString?.() ?? String(row.awardedAmount),
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });
  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_AWARD_APPROVED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      awardId: row.id,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true, award: serializeAward(row) };
}

/**
 * Communicate an APPROVED award to the winning supplier (simulated).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; awardId: string; actorOrgUserId: string; actorRoleName: string }} opts
 */
export async function communicateAward(prisma, opts) {
  const row = await prisma.projectOrgAward.findFirst({
    where: { id: opts.awardId, projectId: opts.projectId },
    include: awardInclude,
  });
  if (!row) return { ok: false, error: "Award not found.", status: 404 };
  if (row.status !== OrgAwardStatus.APPROVED) {
    return { ok: false, error: "Only an approved award can be communicated.", status: 400 };
  }

  const updated = await prisma.projectOrgAward.update({
    where: { id: row.id },
    data: { status: OrgAwardStatus.COMMUNICATED, communicatedAt: new Date() },
    include: awardInclude,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_AWARD_COMMUNICATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: row.procurementId,
      awardId: row.id,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  await notifyProvider(prisma, {
    projectId: opts.projectId,
    providerId: row.supplierId,
    procurementId: row.procurementId,
    title: "Award notice: accept or decline",
    body: `You have been awarded this procurement at ${formatMoneyUGX(row.awardedAmount?.toString?.())}. Accept or decline the award.`,
    relatedEntityType: "award",
    relatedEntityId: row.id,
  });

  const others = await prisma.projectOrgOffer.findMany({
    where: { procurementId: row.procurementId, supplierId: { not: row.supplierId } },
    select: { supplierId: true },
    distinct: ["supplierId"],
  });
  for (const o of others) {
    await notifyProvider(prisma, {
      projectId: opts.projectId,
      providerId: o.supplierId,
      procurementId: row.procurementId,
      title: "Award decision",
      body: `Your bid was not successful. The award went to ${row.supplier?.name || "another bidder"} at ${formatMoneyUGX(row.awardedAmount?.toString?.())}.`,
    });
  }

  if (row.supplier?.isGenerated) {
    await respondToAward(prisma, {
      projectId: opts.projectId,
      providerId: row.supplierId,
      procurementId: row.procurementId,
      body: { decision: "ACCEPT", acceptedByName: row.supplier.contactPerson || row.supplier.name },
      auto: true,
    });
  }

  return { ok: true, award: serializeAward(updated), notifiedUnsuccessful: others.length };
}

/**
 * The winning provider accepts or declines its COMMUNICATED award (portal, or auto-response).
 * Acceptance lets the PDU prepare the LPO / contract; a decline goes back to the PDU.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerId: string; procurementId: string; body: any; auto?: boolean }} opts
 */
export async function respondToAward(prisma, opts) {
  const v = validatePurchaseInstructionResponse(opts.body || {});
  if (!v.ok) return { ok: false, status: 400, error: "Please fix the highlighted fields.", fieldErrors: v.errors };

  const row = await prisma.projectOrgAward.findFirst({
    where: { projectId: opts.projectId, procurementId: opts.procurementId, supplierId: opts.providerId },
    orderBy: { createdAt: "desc" },
    include: {
      ...awardInclude,
      procurement: {
        select: {
          id: true,
          procurementNumber: true,
          title: true,
          officer: { select: { id: true, linkedUserId: true } },
          instances: {
            where: { status: { in: [OrgWorkflowInstanceStatus.ACTIVE, OrgWorkflowInstanceStatus.IN_PROGRESS] } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });
  if (!row) return { ok: false, status: 404, error: "Award not found." };
  if (row.status !== OrgAwardStatus.COMMUNICATED) {
    return { ok: false, status: 409, error: "You have already responded to this award." };
  }

  const accept = v.values.decision === "ACCEPT";
  const now = new Date();
  const claimed = await prisma.projectOrgAward.updateMany({
    where: { id: row.id, status: OrgAwardStatus.COMMUNICATED },
    data: accept
      ? { status: OrgAwardStatus.ACCEPTED, acceptedAt: now, acceptedByName: v.values.acceptedByName }
      : { status: OrgAwardStatus.DECLINED, declinedAt: now, declineReason: v.values.declineReason },
  });
  if (claimed.count !== 1) {
    return { ok: false, status: 409, error: "You have already responded to this award." };
  }

  const proc = row.procurement;
  const providerLabel = `${row.supplier?.name || "Provider"}${opts.auto ? " (auto-response)" : ""}`;
  await writeAuditLog({
    eventType: accept ? AuditEvent.PROJECT_ORG_AWARD_ACCEPTED : AuditEvent.PROJECT_ORG_AWARD_DECLINED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: proc.id,
      awardId: row.id,
      supplierId: opts.providerId,
      actorName: accept ? `${v.values.acceptedByName} — ${providerLabel}` : providerLabel,
      actorRoleName: "Provider",
      newStatus: accept ? OrgAwardStatus.ACCEPTED : OrgAwardStatus.DECLINED,
      remarks: accept ? null : v.values.declineReason,
    },
  });

  /** @type {{ id: string; linkedUserId: string | null }[]} */
  let recipients = proc.officer ? [proc.officer] : [];
  const instanceId = proc.instances[0]?.id || null;
  if (instanceId) {
    const holders = await prisma.projectOrgWorkflowTask.findMany({
      where: { instanceId, status: OrgWorkflowTaskStatus.PENDING, assigneeOrgUserId: { not: null } },
      select: { assignee: { select: { id: true, linkedUserId: true } } },
    });
    recipients = [...recipients, ...holders.map((t) => t.assignee).filter(Boolean)];
  }
  const unique = [...new Map(recipients.map((r) => [r.id, r])).values()];
  if (unique.length) {
    await notifyOrgUsers(prisma, {
      projectId: opts.projectId,
      recipients: unique,
      type: accept ? OrgNotificationType.WORKFLOW_APPROVED : OrgNotificationType.WORKFLOW_REJECTED,
      title: accept ? `Award accepted: ${proc.procurementNumber}` : `Award declined: ${proc.procurementNumber}`,
      body: accept
        ? `${providerLabel} accepted the award. The LPO / contract can now be prepared.`
        : `${providerLabel} declined the award: ${v.values.declineReason}`,
      linkUrl: `/projects/${opts.projectId}/procurements/${proc.id}`,
      relatedEntityType: "award",
      relatedEntityId: row.id,
    });
  }

  return { ok: true, decision: v.values.decision };
}

/**
 * Cancel an award that has not yet progressed into an LPO/contract.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   awardId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   reason?: string | null;
 * }} opts
 */
export async function cancelAward(prisma, opts) {
  const row = await prisma.projectOrgAward.findFirst({
    where: { id: opts.awardId, projectId: opts.projectId },
    include: awardInclude,
  });
  if (!row) return { ok: false, error: "Award not found.", status: 404 };
  if (row.status === OrgAwardStatus.CANCELLED) {
    return { ok: false, error: "This award is already cancelled.", status: 400 };
  }

  const hasOrder = await prisma.projectOrgLpo.findFirst({
    where: {
      projectId: opts.projectId,
      procurementId: row.procurementId,
      status: { notIn: ["CANCELLED"] },
    },
  });
  const hasContract = await prisma.projectOrgContract.findFirst({
    where: {
      projectId: opts.projectId,
      procurementId: row.procurementId,
      status: { notIn: ["CANCELLED"] },
    },
  });
  if (hasOrder || hasContract) {
    return {
      ok: false,
      error:
        "Cannot cancel this award because an LPO or contract has already been created. Cancel or reverse those documents first.",
      status: 400,
      code: "ORDER_EXISTS",
    };
  }

  const reason = typeof opts.reason === "string" ? opts.reason.trim() : "";
  if (!reason) {
    return {
      ok: false,
      error: "Provide a reason when cancelling an award.",
      status: 400,
      fieldErrors: { reason: "Enter a cancellation reason." },
    };
  }

  const updated = await prisma.projectOrgAward.update({
    where: { id: row.id },
    data: { status: OrgAwardStatus.CANCELLED },
    include: awardInclude,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_AWARD_CANCELLED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: row.procurementId,
      awardId: row.id,
      reason,
      previousStatus: row.status,
      newStatus: OrgAwardStatus.CANCELLED,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  if (row.status === OrgAwardStatus.COMMUNICATED || row.status === OrgAwardStatus.ACCEPTED) {
    await notifyProvider(prisma, {
      projectId: opts.projectId,
      providerId: row.supplierId,
      linkUrl: "/provider-portal",
      relatedEntityType: "procurement",
      relatedEntityId: row.procurementId,
      title: "Award cancelled",
      body: `Reason: ${reason}`,
    });
  }

  return { ok: true, award: serializeAward(updated) };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
export async function getLatestAward(prisma, projectId, procurementId) {
  const row = await prisma.projectOrgAward.findFirst({
    where: { projectId, procurementId, status: { not: OrgAwardStatus.CANCELLED } },
    orderBy: { createdAt: "desc" },
    include: awardInclude,
  });
  return row ? serializeAward(row) : null;
}
