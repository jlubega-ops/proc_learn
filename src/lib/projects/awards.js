import { OrgAwardStatus, OrgEvaluationReportStatus, OrgProcurementStatus } from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyOrgUsers, OrgNotificationType } from "@/lib/projects/org-notifications";
import { postQualificationRequired } from "@/lib/projects/post-qualification";
import { serializeSupplier } from "@/lib/projects/suppliers";

/**
 * @param {any} row
 */
export function serializeAward(row) {
  if (!row) return null;
  return {
    id: row.id,
    procurementId: row.procurementId,
    supplierId: row.supplierId,
    supplier: row.supplier ? serializeSupplier(row.supplier) : null,
    awardedAmount: row.awardedAmount?.toString?.() ?? String(row.awardedAmount ?? ""),
    status: row.status,
    awardDate: row.awardDate || null,
    communicatedAt: row.communicatedAt || null,
    acceptedAt: row.acceptedAt || null,
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
        approvalReference: typeof opts.approvalReference === "string" ? opts.approvalReference.trim() || null : null,
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

  return { ok: true, award: serializeAward(updated) };
}

/**
 * Record the supplier's acceptance of a COMMUNICATED award (simulated).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; awardId: string; actorOrgUserId: string; actorRoleName: string }} opts
 */
export async function acceptAward(prisma, opts) {
  const row = await prisma.projectOrgAward.findFirst({
    where: { id: opts.awardId, projectId: opts.projectId },
    include: awardInclude,
  });
  if (!row) return { ok: false, error: "Award not found.", status: 404 };
  if (row.status !== OrgAwardStatus.COMMUNICATED) {
    return { ok: false, error: "The award must be communicated to the supplier before it can be accepted.", status: 400 };
  }

  const updated = await prisma.projectOrgAward.update({
    where: { id: row.id },
    data: { status: OrgAwardStatus.ACCEPTED, acceptedAt: new Date() },
    include: awardInclude,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_AWARD_ACCEPTED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: row.procurementId,
      awardId: row.id,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
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
      title: "Award accepted",
      body: "The supplier accepted the award. You may now proceed to issue a contract or LPO.",
      linkUrl: `/projects/${opts.projectId}/procurements/${row.procurementId}`,
      relatedEntityType: "award",
      relatedEntityId: row.id,
    });
  }

  return { ok: true, award: serializeAward(updated) };
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
        "Cannot cancel this award because an LPO or contract has already been created. Cancel or reverse those documents first where the simulation allows.",
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
