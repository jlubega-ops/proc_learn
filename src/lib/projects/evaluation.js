import {
  OrgCommitteeType,
  OrgEvaluationReportStatus,
  OrgProcurementMethod,
  OrgProcurementStatus,
  Prisma,
} from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyOrgUsers, OrgNotificationType } from "@/lib/projects/org-notifications";
import { requireCommitteeMembership, resolveCommitteeContext } from "@/lib/projects/committee-context";
import { WORKFLOW_TRIGGERS } from "@/lib/projects/process-catalogue";
import { startWorkflowFromTrigger } from "@/lib/projects/workflow-engine";

/**
 * Evaluation reports compare offers received for QUOTATION / TENDER procurements
 * and recommend a supplier. Authoring is gated on Evaluation Committee membership;
 * approval is a Contracts Committee decision (PPDA: the committee, not an individual
 * officer, approves the evaluation report and the award).
 */

/**
 * @param {any} row
 */
export function serializeEvaluationReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    procurementId: row.procurementId,
    committeeId: row.committeeId || null,
    committee: row.committee ? { id: row.committee.id, name: row.committee.name } : null,
    recommendedSupplierId: row.recommendedSupplierId || null,
    recommendedSupplier: row.recommendedSupplier
      ? { id: row.recommendedSupplier.id, name: row.recommendedSupplier.name }
      : null,
    evaluatedAmount: row.evaluatedAmount?.toString?.() ?? (row.evaluatedAmount != null ? String(row.evaluatedAmount) : null),
    recommendation: row.recommendation || null,
    comments: row.comments || null,
    scoresJson: row.scoresJson || null,
    eligibility: row.eligibilityJson || null,
    status: row.status,
    approvedAt: row.approvedAt || null,
    participations: Array.isArray(row.participations)
      ? row.participations.map((p) => ({
          id: p.id,
          orgUserId: p.orgUserId,
          committeeRole: p.committeeRole || null,
          conflictOfInterest: p.conflictOfInterest,
          comments: p.comments || null,
        }))
      : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const evaluationReportInclude = {
  committee: { select: { id: true, name: true } },
  recommendedSupplier: { select: { id: true, name: true } },
  participations: true,
};

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
async function loadProcurementForEvaluation(prisma, projectId, procurementId) {
  return prisma.projectOrgProcurement.findFirst({
    where: { id: procurementId, projectId },
    include: {
      offers: { where: { status: { notIn: ["WITHDRAWN", "LATE"] } } },
      requisition: { select: { estimatedTotalValue: true } },
    },
  });
}

/**
 * Create a DRAFT evaluation report for a procurement. The acting org user must be an
 * active member of an Evaluation Committee (optionally scoped via opts.activeCommitteeId).
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   activeCommitteeId?: string | null;
 *   committeeRole?: string | null;
 *   recommendedSupplierId?: string | null;
 *   evaluatedAmount?: string | number | null;
 *   recommendation?: string | null;
 *   comments?: string | null;
 *   scoresJson?: object | null;
 *   participants?: { orgUserId: string; committeeRole?: string | null; conflictOfInterest?: boolean; comments?: string | null }[];
 * }} opts
 */
export async function createEvaluationReport(prisma, opts) {
  const procurement = await loadProcurementForEvaluation(prisma, opts.projectId, opts.procurementId);
  if (!procurement) {
    return { ok: false, error: "Procurement not found in this organisation.", status: 404 };
  }
  if (procurement.procurementMethod === OrgProcurementMethod.MICRO) {
    return {
      ok: false,
      error:
        "Micro Procurement does not require an evaluation report — it moves straight to a purchase instruction.",
      status: 400,
    };
  }
  if ((procurement.offers || []).length === 0) {
    return {
      ok: false,
      error: "Open at least one offer/quotation/bid before an evaluation report can be created.",
      status: 400,
      code: "NO_OFFERS",
    };
  }

  const ctx = await resolveCommitteeContext(prisma, {
    orgUserId: opts.actorOrgUserId,
    activeCommitteeId: opts.activeCommitteeId,
    committeeRole: opts.committeeRole,
  });
  const membership = await requireCommitteeMembership(prisma, {
    projectId: opts.projectId,
    orgUserId: opts.actorOrgUserId,
    committeeId: ctx.committeeId,
    committeeType: OrgCommitteeType.EVALUATION,
  });
  if (!membership.ok) return membership;

  let recommendedSupplierId = null;
  if (opts.recommendedSupplierId) {
    const supplier = await prisma.projectOrgProvider.findFirst({
      where: { id: opts.recommendedSupplierId, projectId: opts.projectId },
    });
    if (!supplier) {
      return {
        ok: false,
        error: "Choose a supplier registered in this organisation.",
        status: 400,
        fieldErrors: { recommendedSupplierId: "Choose a valid supplier." },
      };
    }
    const offered = (procurement.offers || []).some((o) => o.supplierId === supplier.id);
    if (!offered) {
      return {
        ok: false,
        error: "The recommended supplier must be one who submitted an offer for this procurement.",
        status: 400,
        code: "SUPPLIER_DID_NOT_OFFER",
      };
    }
    recommendedSupplierId = supplier.id;
  }

  const evaluatedAmount =
    opts.evaluatedAmount != null && opts.evaluatedAmount !== ""
      ? new Prisma.Decimal(Number(opts.evaluatedAmount).toFixed(2))
      : null;

  const participants = Array.isArray(opts.participants) ? opts.participants : [];
  const row = await prisma.projectOrgEvaluationReport.create({
    data: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      committeeId: membership.committee.id,
      recommendedSupplierId,
      evaluatedAmount,
      recommendation: typeof opts.recommendation === "string" ? opts.recommendation.trim() || null : null,
      comments: typeof opts.comments === "string" ? opts.comments.trim() || null : null,
      scoresJson: opts.scoresJson || undefined,
      status: OrgEvaluationReportStatus.DRAFT,
      participations: {
        create: participants
          .filter((p) => p?.orgUserId)
          .map((p) => ({
            orgUserId: p.orgUserId,
            committeeRole: p.committeeRole || null,
            conflictOfInterest: Boolean(p.conflictOfInterest),
            comments: typeof p.comments === "string" ? p.comments.trim() || null : null,
          })),
      },
    },
    include: evaluationReportInclude,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_EVALUATION_CREATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      evaluationReportId: row.id,
      committeeId: membership.committee.id,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  try {
    await startWorkflowFromTrigger(prisma, {
      projectId: opts.projectId,
      triggerKey: WORKFLOW_TRIGGERS.EVALUATION_STARTED,
      entityType: "procurement",
      entityId: procurement.id,
      procurementId: procurement.id,
      entityTitle: `Evaluation: ${row.id}`,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
  } catch {
    // Best-effort tracking workflow — the evaluation report itself is the source of truth.
  }

  return { ok: true, evaluationReport: serializeEvaluationReport(row) };
}

/**
 * Submit a DRAFT evaluation report for approval. Requires a recommended supplier and
 * evaluated amount to be set (either at create time or here).
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   evaluationReportId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   activeCommitteeId?: string | null;
 * }} opts
 */
export async function submitEvaluationReport(prisma, opts) {
  const row = await prisma.projectOrgEvaluationReport.findFirst({
    where: { id: opts.evaluationReportId, projectId: opts.projectId },
    include: evaluationReportInclude,
  });
  if (!row) return { ok: false, error: "Evaluation report not found.", status: 404 };
  if (![OrgEvaluationReportStatus.DRAFT, OrgEvaluationReportStatus.RETURNED].includes(row.status)) {
    return { ok: false, error: "This evaluation report cannot be submitted.", status: 400 };
  }
  if (!row.recommendedSupplierId || row.evaluatedAmount == null) {
    return {
      ok: false,
      error: "Set a recommended supplier and evaluated amount before submitting.",
      status: 400,
      fieldErrors: {
        recommendedSupplierId: !row.recommendedSupplierId ? "Choose a recommended supplier." : undefined,
        evaluatedAmount: row.evaluatedAmount == null ? "Enter the evaluated amount." : undefined,
      },
    };
  }

  const ctx = await resolveCommitteeContext(prisma, {
    orgUserId: opts.actorOrgUserId,
    activeCommitteeId: opts.activeCommitteeId || row.committeeId,
  });
  const membership = await requireCommitteeMembership(prisma, {
    projectId: opts.projectId,
    orgUserId: opts.actorOrgUserId,
    committeeId: ctx.committeeId || row.committeeId,
    committeeType: OrgCommitteeType.EVALUATION,
  });
  if (!membership.ok) return membership;

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.projectOrgEvaluationReport.update({
      where: { id: row.id },
      data: { status: OrgEvaluationReportStatus.SUBMITTED },
      include: evaluationReportInclude,
    });
    await tx.projectOrgProcurement.update({
      where: { id: row.procurementId },
      data: { status: OrgProcurementStatus.EVALUATION },
    });
    return u;
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_EVALUATION_SUBMITTED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: row.procurementId,
      evaluationReportId: row.id,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  const approvers = await prisma.projectOrgUser.findMany({
    where: { projectId: opts.projectId, projectOrgRole: { name: { in: ["Contracts Officer"] } } },
    select: { id: true, linkedUserId: true },
  });
  if (approvers.length) {
    await notifyOrgUsers(prisma, {
      projectId: opts.projectId,
      recipients: approvers,
      type: OrgNotificationType.WORKFLOW_TASK,
      title: "Evaluation report ready for approval",
      body: `An evaluation report was submitted for procurement review. Open Procurements to approve or return it.`,
      linkUrl: `/projects/${opts.projectId}/procurements/${row.procurementId}`,
      relatedEntityType: "evaluation_report",
      relatedEntityId: row.id,
    });
  }

  return { ok: true, evaluationReport: serializeEvaluationReport(updated) };
}

/**
 * Approve / return / reject a SUBMITTED evaluation report. This is an oversight
 * decision — the approver does not need to be a committee member.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   evaluationReportId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   decision: "APPROVE" | "RETURN" | "REJECT";
 *   comment?: string | null;
 * }} opts
 */
export async function decideEvaluationReport(prisma, opts) {
  const row = await prisma.projectOrgEvaluationReport.findFirst({
    where: { id: opts.evaluationReportId, projectId: opts.projectId },
    include: evaluationReportInclude,
  });
  if (!row) return { ok: false, error: "Evaluation report not found.", status: 404 };
  if (row.status !== OrgEvaluationReportStatus.SUBMITTED) {
    return { ok: false, error: "Only a submitted evaluation report can be decided on.", status: 400 };
  }

  const decision = String(opts.decision || "").toUpperCase();
  const needsComment = decision === "RETURN" || decision === "REJECT";
  if (needsComment && !String(opts.comment || "").trim()) {
    return {
      ok: false,
      error: "A comment is required when returning or rejecting an evaluation report.",
      status: 400,
      fieldErrors: { comment: "Enter a meaningful comment." },
    };
  }

  const newStatus =
    decision === "APPROVE"
      ? OrgEvaluationReportStatus.APPROVED
      : decision === "RETURN"
        ? OrgEvaluationReportStatus.RETURNED
        : decision === "REJECT"
          ? OrgEvaluationReportStatus.REJECTED
          : null;
  if (!newStatus) {
    return { ok: false, error: "Choose Approve, Return, or Reject.", status: 400 };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.projectOrgEvaluationReport.update({
      where: { id: row.id },
      data: {
        status: newStatus,
        approvedAt: newStatus === OrgEvaluationReportStatus.APPROVED ? new Date() : null,
      },
      include: evaluationReportInclude,
    });
    if (newStatus === OrgEvaluationReportStatus.APPROVED) {
      await tx.projectOrgProcurement.update({
        where: { id: row.procurementId },
        data: { status: OrgProcurementStatus.AWARD_PENDING },
      });
    }
    return u;
  });

  await writeAuditLog({
    eventType:
      newStatus === OrgEvaluationReportStatus.APPROVED
        ? AuditEvent.PROJECT_ORG_EVALUATION_APPROVED
        : AuditEvent.PROJECT_ORG_EVALUATION_REJECTED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: row.procurementId,
      evaluationReportId: row.id,
      decision,
      comment: opts.comment || null,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  const committeeMembers = await prisma.projectOrgCommitteeMember.findMany({
    where: { committeeId: row.committeeId, status: "ACTIVE" },
    include: { orgUser: { select: { id: true, linkedUserId: true } } },
  });
  const recipients = committeeMembers.map((m) => m.orgUser).filter(Boolean);
  if (recipients.length) {
    await notifyOrgUsers(prisma, {
      projectId: opts.projectId,
      recipients,
      type:
        newStatus === OrgEvaluationReportStatus.APPROVED
          ? OrgNotificationType.WORKFLOW_APPROVED
          : newStatus === OrgEvaluationReportStatus.RETURNED
            ? OrgNotificationType.WORKFLOW_RETURNED
            : OrgNotificationType.WORKFLOW_REJECTED,
      title: `Evaluation report ${newStatus.toLowerCase()}`,
      body: `${opts.actorRoleName || "Reviewer"} ${decision.toLowerCase()}d the evaluation report.${opts.comment ? ` ${opts.comment}` : ""}`,
      linkUrl: `/projects/${opts.projectId}/procurements/${row.procurementId}`,
      relatedEntityType: "evaluation_report",
      relatedEntityId: row.id,
    });
  }

  return { ok: true, evaluationReport: serializeEvaluationReport(updated) };
}

/**
 * Fetch the latest evaluation report for a procurement (most recent first).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
export async function getLatestEvaluationReport(prisma, projectId, procurementId) {
  const row = await prisma.projectOrgEvaluationReport.findFirst({
    where: { projectId, procurementId },
    orderBy: { createdAt: "desc" },
    include: evaluationReportInclude,
  });
  return row ? serializeEvaluationReport(row) : null;
}

/**
 * List evaluation reports for a procurement (oldest first).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
export async function listEvaluationReports(prisma, projectId, procurementId) {
  const rows = await prisma.projectOrgEvaluationReport.findMany({
    where: { projectId, procurementId },
    orderBy: { createdAt: "asc" },
    include: evaluationReportInclude,
  });
  return rows.map(serializeEvaluationReport);
}
