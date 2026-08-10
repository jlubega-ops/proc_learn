import {
  OrgPostQualificationStatus,
  OrgProcurementMethod,
  OrgEvaluationReportStatus,
} from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyOrgUsers, OrgNotificationType } from "@/lib/projects/org-notifications";
import { WORKFLOW_TRIGGERS } from "@/lib/projects/process-catalogue";
import { startWorkflowFromTrigger } from "@/lib/projects/workflow-engine";

/**
 * Post-qualification verifies a recommended supplier's registration, tax compliance,
 * and experience before award — required for TENDER (always) and for any procurement
 * explicitly flagged with `requiresPostQualification`.
 */

/**
 * @param {any} row
 */
export function serializePostQualificationReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    procurementId: row.procurementId,
    supplierId: row.supplierId || null,
    registrationVerified: row.registrationVerified,
    taxComplianceVerified: row.taxComplianceVerified,
    experienceVerified: row.experienceVerified,
    comments: row.comments || null,
    status: row.status,
    approvedAt: row.approvedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * @param {any} procurement
 */
export function postQualificationRequired(procurement) {
  return Boolean(
    procurement?.requiresPostQualification || procurement?.procurementMethod === OrgProcurementMethod.TENDER,
  );
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
async function loadProcurementWithApprovedEvaluation(prisma, projectId, procurementId) {
  const procurement = await prisma.projectOrgProcurement.findFirst({
    where: { id: procurementId, projectId },
  });
  if (!procurement) return { procurement: null, evaluation: null };
  const evaluation = await prisma.projectOrgEvaluationReport.findFirst({
    where: { projectId, procurementId, status: OrgEvaluationReportStatus.APPROVED },
    orderBy: { approvedAt: "desc" },
  });
  return { procurement, evaluation };
}

/**
 * Create the DRAFT post-qualification checklist for the recommended supplier from
 * the (already approved) evaluation report.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   comments?: string | null;
 * }} opts
 */
export async function createPostQualificationChecklist(prisma, opts) {
  const { procurement, evaluation } = await loadProcurementWithApprovedEvaluation(
    prisma,
    opts.projectId,
    opts.procurementId,
  );
  if (!procurement) return { ok: false, error: "Procurement not found in this organisation.", status: 404 };
  if (!postQualificationRequired(procurement)) {
    return {
      ok: false,
      error: "Post-qualification is not required for this procurement (only TENDER, or when flagged).",
      status: 400,
      code: "PQ_NOT_REQUIRED",
    };
  }
  if (!evaluation || !evaluation.recommendedSupplierId) {
    return {
      ok: false,
      error: "An approved evaluation report with a recommended supplier is required before post-qualification.",
      status: 400,
      code: "NO_APPROVED_EVALUATION",
    };
  }

  const existing = await prisma.projectOrgPostQualificationReport.findFirst({
    where: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      status: { in: [OrgPostQualificationStatus.DRAFT, OrgPostQualificationStatus.SUBMITTED] },
    },
  });
  if (existing) {
    return {
      ok: false,
      error: "A post-qualification checklist is already open for this procurement.",
      status: 400,
      code: "PQ_ALREADY_OPEN",
    };
  }

  const row = await prisma.projectOrgPostQualificationReport.create({
    data: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      supplierId: evaluation.recommendedSupplierId,
      comments: typeof opts.comments === "string" ? opts.comments.trim() || null : null,
      status: OrgPostQualificationStatus.DRAFT,
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_EVALUATION_CREATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      postQualificationReportId: row.id,
      supplierId: evaluation.recommendedSupplierId,
      kind: "post_qualification_created",
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  try {
    await startWorkflowFromTrigger(prisma, {
      projectId: opts.projectId,
      triggerKey: WORKFLOW_TRIGGERS.POST_QUALIFICATION_STARTED,
      entityType: "procurement",
      entityId: procurement.id,
      procurementId: procurement.id,
      entityTitle: `Post-qualification: ${row.id}`,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
  } catch {
    // Best-effort tracking workflow.
  }

  return { ok: true, postQualificationReport: serializePostQualificationReport(row) };
}

/**
 * Record verification checks and submit the checklist for approval.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   postQualificationReportId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   registrationVerified: boolean;
 *   taxComplianceVerified: boolean;
 *   experienceVerified: boolean;
 *   comments?: string | null;
 * }} opts
 */
export async function verifyPostQualificationChecklist(prisma, opts) {
  const row = await prisma.projectOrgPostQualificationReport.findFirst({
    where: { id: opts.postQualificationReportId, projectId: opts.projectId },
  });
  if (!row) return { ok: false, error: "Post-qualification checklist not found.", status: 404 };
  if (![OrgPostQualificationStatus.DRAFT, OrgPostQualificationStatus.SUBMITTED].includes(row.status)) {
    return { ok: false, error: "This checklist can no longer be edited.", status: 400 };
  }

  const updated = await prisma.projectOrgPostQualificationReport.update({
    where: { id: row.id },
    data: {
      registrationVerified: Boolean(opts.registrationVerified),
      taxComplianceVerified: Boolean(opts.taxComplianceVerified),
      experienceVerified: Boolean(opts.experienceVerified),
      comments: typeof opts.comments === "string" ? opts.comments.trim() || row.comments : row.comments,
      status: OrgPostQualificationStatus.SUBMITTED,
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_EVALUATION_SUBMITTED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: row.procurementId,
      postQualificationReportId: row.id,
      kind: "post_qualification_verified",
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  const approvers = await prisma.projectOrgUser.findMany({
    where: { projectId: opts.projectId, projectOrgRole: { name: { in: ["Head PDU"] } } },
    select: { id: true, linkedUserId: true },
  });
  if (approvers.length) {
    await notifyOrgUsers(prisma, {
      projectId: opts.projectId,
      recipients: approvers,
      type: OrgNotificationType.WORKFLOW_TASK,
      title: "Post-qualification checklist ready for approval",
      body: "A post-qualification checklist was submitted. Open the procurement to approve or reject it.",
      linkUrl: `/projects/${opts.projectId}/procurements/${row.procurementId}`,
      relatedEntityType: "post_qualification_report",
      relatedEntityId: row.id,
    });
  }

  return { ok: true, postQualificationReport: serializePostQualificationReport(updated) };
}

/**
 * Approve or reject a SUBMITTED post-qualification checklist. Approval requires
 * all three checks to be true.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   postQualificationReportId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   decision: "APPROVE" | "REJECT";
 *   comment?: string | null;
 * }} opts
 */
export async function decidePostQualificationReport(prisma, opts) {
  const row = await prisma.projectOrgPostQualificationReport.findFirst({
    where: { id: opts.postQualificationReportId, projectId: opts.projectId },
  });
  if (!row) return { ok: false, error: "Post-qualification checklist not found.", status: 404 };
  if (row.status !== OrgPostQualificationStatus.SUBMITTED) {
    return { ok: false, error: "Only a submitted checklist can be decided on.", status: 400 };
  }

  const decision = String(opts.decision || "").toUpperCase();
  if (decision === "REJECT" && !String(opts.comment || "").trim()) {
    return {
      ok: false,
      error: "A comment is required when rejecting a post-qualification checklist.",
      status: 400,
      fieldErrors: { comment: "Enter a meaningful comment." },
    };
  }
  if (decision === "APPROVE" && !(row.registrationVerified && row.taxComplianceVerified && row.experienceVerified)) {
    return {
      ok: false,
      error:
        "All three checks (registration, tax compliance, experience) must be verified before approval.",
      status: 400,
      code: "PQ_INCOMPLETE",
    };
  }

  const newStatus =
    decision === "APPROVE"
      ? OrgPostQualificationStatus.APPROVED
      : decision === "REJECT"
        ? OrgPostQualificationStatus.REJECTED
        : null;
  if (!newStatus) return { ok: false, error: "Choose Approve or Reject.", status: 400 };

  const updated = await prisma.projectOrgPostQualificationReport.update({
    where: { id: row.id },
    data: { status: newStatus, approvedAt: newStatus === OrgPostQualificationStatus.APPROVED ? new Date() : null },
  });

  await writeAuditLog({
    eventType:
      newStatus === OrgPostQualificationStatus.APPROVED
        ? AuditEvent.PROJECT_ORG_EVALUATION_APPROVED
        : AuditEvent.PROJECT_ORG_EVALUATION_REJECTED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: row.procurementId,
      postQualificationReportId: row.id,
      kind: "post_qualification_decided",
      decision,
      comment: opts.comment || null,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true, postQualificationReport: serializePostQualificationReport(updated) };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
export async function getLatestPostQualificationReport(prisma, projectId, procurementId) {
  const row = await prisma.projectOrgPostQualificationReport.findFirst({
    where: { projectId, procurementId },
    orderBy: { createdAt: "desc" },
  });
  return row ? serializePostQualificationReport(row) : null;
}
