import {
  OrgAwardStatus,
  OrgProcurementRecommendationKind,
  OrgProcurementRecommendationStatus,
  OrgProcurementStatus,
  OrgProviderStatus,
  OrgWorkflowInstanceStatus,
  OrgWorkflowTaskStatus,
  Prisma,
} from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { assessProviderSelection } from "@/lib/projects/providers";
import { resolveEligibleOrgUsers } from "@/lib/projects/workflow-engine";
import { notifyOrgUsers, OrgNotificationType } from "@/lib/projects/org-notifications";
import { notifyProvider } from "@/lib/projects/provider-notifications";
import { isCommitteeWorkflowRole } from "@/lib/projects/committee-context";
import {
  RECOMMENDATION_KIND_LABELS,
  RECOMMENDATION_TASK_PREFIX,
  isRecommendationDecisionTask,
  mayRecommendToContractsCommittee,
  recommendationReasonLabel,
  recommendationReasons,
} from "@/lib/projects/procurement-recommendation-options";
import { MIN_RFQ_PROVIDERS } from "@/lib/projects/procurement-thresholds";

const CONTRACTS_COMMITTEE_ROLE = "Contracts Committee";
const TERMINAL_STATUSES = new Set([
  OrgProcurementStatus.CLOSED,
  OrgProcurementStatus.CANCELLED,
  OrgProcurementStatus.REJECTED,
]);
/** RFQs can only be re-addressed before they go out to providers. */
const PRE_ISSUE_SOLICITATION = new Set(["DRAFT", "REVIEW", "APPROVED"]);
const LIVE_AWARD_STATUSES = [
  OrgAwardStatus.APPROVED,
  OrgAwardStatus.COMMUNICATED,
  OrgAwardStatus.ACCEPTED,
];

/** @param {{ firstName?: string | null; lastName?: string | null } | null | undefined} u */
function personName(u) {
  return u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || null : null;
}

/** @param {any} row */
export function serializeRecommendation(row) {
  return {
    id: row.id,
    kind: row.kind,
    kindLabel: RECOMMENDATION_KIND_LABELS[row.kind] || row.kind,
    reason: row.reason,
    reasonLabel: recommendationReasonLabel(row.kind, row.reason),
    details: row.details,
    alternative: row.alternative || null,
    status: row.status,
    currentProvider: row.currentProvider
      ? { id: row.currentProvider.id, name: row.currentProvider.name }
      : null,
    currentShortlist: Array.isArray(row.currentShortlist) ? row.currentShortlist : [],
    proposedShortlist: Array.isArray(row.proposedShortlist) ? row.proposedShortlist : [],
    proposedProvider: row.proposedProvider
      ? { id: row.proposedProvider.id, name: row.proposedProvider.name }
      : null,
    recommendedBy: row.recommendedBy
      ? { displayName: personName(row.recommendedBy), roleName: row.recommendedByRoleName || null }
      : null,
    decidedBy: row.decidedBy
      ? {
          displayName: personName(row.decidedBy),
          roleName: row.decidedByRoleName || null,
          committeeId: row.committeeId || null,
          committeeRole: row.committeeId ? row.decidedByRoleName || null : null,
          committeeName: null,
          stepRoleName: row.committeeId ? "Contracts Committee" : null,
        }
      : null,
    decisionComment: row.decisionComment || null,
    decidedAt: row.decidedAt || null,
    createdAt: row.createdAt,
  };
}

const RECOMMENDATION_INCLUDE = {
  currentProvider: { select: { id: true, name: true } },
  proposedProvider: { select: { id: true, name: true } },
  recommendedBy: { select: { firstName: true, lastName: true } },
  decidedBy: { select: { firstName: true, lastName: true } },
};

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string }} opts
 */
export async function loadRecommendations(prisma, opts) {
  const rows = await prisma.projectOrgProcurementRecommendation.findMany({
    where: { projectId: opts.projectId, procurementId: opts.procurementId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: RECOMMENDATION_INCLUDE,
  });
  const ids = [...new Set(rows.map((r) => r.committeeId).filter(Boolean))];
  const committees = ids.length
    ? await prisma.projectOrgCommittee.findMany({
        where: { id: { in: /** @type {string[]} */ (ids) } },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(committees.map((c) => [c.id, c.name]));
  return rows.map((r) => {
    const out = serializeRecommendation(r);
    if (out.decidedBy?.committeeId) out.decidedBy.committeeName = names.get(out.decidedBy.committeeId) || null;
    return out;
  });
}

/**
 * Whether the case is still before award / order, so the PDU may recommend
 * cancellation (or, for micro, a change of the approved provider).
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {{ projectId: string; procurementId: string }} opts
 */
export async function recommendationStage(prisma, opts) {
  const proc = await prisma.projectOrgProcurement.findFirst({
    where: { id: opts.procurementId, projectId: opts.projectId },
    select: {
      id: true,
      status: true,
      procurementMethod: true,
      requisition: { select: { form5PartII: true } },
      solicitations: { select: { status: true } },
      _count: {
        select: {
          purchaseInstructions: { where: { status: { not: "DECLINED" } } },
          lpos: true,
          contracts: true,
          awards: { where: { status: { in: LIVE_AWARD_STATUSES } } },
        },
      },
    },
  });
  if (!proc) {
    return {
      allowed: false,
      awardDeclined: false,
      kinds: [],
      currentProviderId: null,
      currentShortlist: [],
      procurement: null,
    };
  }
  const prepareAwardTasks = await prisma.projectOrgWorkflowTask.findMany({
    where: {
      projectId: opts.projectId,
      instance: { procurementId: opts.procurementId },
      title: { startsWith: "Prepare award recommendation" },
    },
    select: { status: true },
  });
  const awardRecommended =
    prepareAwardTasks.some((t) => t.status === OrgWorkflowTaskStatus.COMPLETED) &&
    !prepareAwardTasks.some(
      (t) => t.status === OrgWorkflowTaskStatus.PENDING || t.status === OrgWorkflowTaskStatus.IN_PROGRESS,
    );
  const latestAward = await prisma.projectOrgAward.findFirst({
    where: { projectId: opts.projectId, procurementId: opts.procurementId },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });
  const awardDeclined = latestAward?.status === OrgAwardStatus.DECLINED;
  const c = proc._count;
  const allowed =
    !TERMINAL_STATUSES.has(proc.status) &&
    (!awardRecommended || awardDeclined) &&
    c.purchaseInstructions === 0 &&
    c.lpos === 0 &&
    c.contracts === 0 &&
    c.awards === 0;
  const shortlist = Array.isArray(proc.requisition?.form5PartII?.shortlist)
    ? proc.requisition.form5PartII.shortlist
    : [];
  const currentProviderId =
    proc.procurementMethod === "MICRO" && shortlist[0]?.id ? String(shortlist[0].id) : null;
  const rfqIssued = (proc.solicitations || []).some((s) => !PRE_ISSUE_SOLICITATION.has(s.status));
  /** @type {{ id: string; name: string }[]} */
  const currentShortlist =
    proc.procurementMethod === "QUOTATION"
      ? shortlist.filter((s) => s?.id).map((s) => ({ id: String(s.id), name: String(s.name || "") }))
      : [];
  /** @type {string[]} */
  const kinds = allowed ? [OrgProcurementRecommendationKind.CANCEL] : [];
  if (allowed && currentProviderId) kinds.push(OrgProcurementRecommendationKind.CHANGE_PROVIDER);
  if (allowed && currentShortlist.length && !rfqIssued) {
    kinds.push(OrgProcurementRecommendationKind.CHANGE_SHORTLIST);
  }
  return { allowed, awardDeclined, kinds, currentProviderId, currentShortlist, procurement: proc };
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {{ projectId: string; procurementId: string }} opts
 */
export function findPendingRecommendation(prisma, opts) {
  return prisma.projectOrgProcurementRecommendation.findFirst({
    where: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      status: OrgProcurementRecommendationStatus.PENDING,
    },
    include: RECOMMENDATION_INCLUDE,
  });
}

/**
 * The viewer's open (non-committee) step on this procurement — the PDU officer's hold on the case.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string; orgUserId: string }} opts
 */
export async function findHeldProcurementTask(prisma, opts) {
  const tasks = await prisma.projectOrgWorkflowTask.findMany({
    where: {
      projectId: opts.projectId,
      assigneeOrgUserId: opts.orgUserId,
      status: { in: [OrgWorkflowTaskStatus.PENDING, OrgWorkflowTaskStatus.IN_PROGRESS] },
      instance: { procurementId: opts.procurementId },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, instanceId: true, requiredRoleName: true },
  });
  return (
    tasks.find(
      (t) => !isCommitteeWorkflowRole(t.requiredRoleName) && !isRecommendationDecisionTask(t.title),
    ) || null
  );
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   body: any;
 * }} opts
 */
export async function submitRecommendation(prisma, opts) {
  const body = opts.body || {};
  if (!mayRecommendToContractsCommittee(opts.actorRoleName)) {
    return { ok: false, status: 403, error: "Only the Head PDU or Procurement Officer can recommend." };
  }
  const held = await findHeldProcurementTask(prisma, {
    projectId: opts.projectId,
    procurementId: opts.procurementId,
    orgUserId: opts.actorOrgUserId,
  });
  const stage = await recommendationStage(prisma, opts);
  if (!stage.allowed || !stage.procurement) {
    return {
      ok: false,
      status: 400,
      error: "Recommendations are closed at this stage.",
    };
  }
  const instanceId =
    held?.instanceId ||
    (stage.awardDeclined
      ? (
          await prisma.projectOrgWorkflowInstance.findFirst({
            where: {
              projectId: opts.projectId,
              procurementId: opts.procurementId,
              status: { in: [OrgWorkflowInstanceStatus.ACTIVE, OrgWorkflowInstanceStatus.IN_PROGRESS] },
            },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          })
        )?.id
      : null);
  if (!instanceId) {
    return { ok: false, status: 403, error: "Only the officer holding this step can recommend." };
  }
  if (await findPendingRecommendation(prisma, opts)) {
    return {
      ok: false,
      status: 409,
      error: "A recommendation is already waiting for the Contracts Committee.",
    };
  }

  const kind = String(body.kind || "").trim().toUpperCase();
  const reason = String(body.reason || "").trim().toUpperCase();
  const details = typeof body.details === "string" ? body.details.trim() : "";
  const alternative = typeof body.alternative === "string" ? body.alternative.trim() : "";
  const proposedProviderId =
    typeof body.proposedProviderId === "string" ? body.proposedProviderId.trim() : "";

  /** @type {Record<string, string>} */
  const fieldErrors = {};
  if (!stage.kinds.includes(kind)) fieldErrors.kind = "Choose a recommendation.";
  if (!recommendationReasons(kind).some((r) => r.value === reason)) {
    fieldErrors.reason = "Choose a reason.";
  }
  if (!details) fieldErrors.details = "Enter the details.";
  else if (details.length > 4000) fieldErrors.details = "Keep it under 4000 characters.";
  if (alternative.length > 2000) fieldErrors.alternative = "Keep it under 2000 characters.";

  /** @type {{ id: string; name: string } | null} */
  let proposed = null;
  if (kind === OrgProcurementRecommendationKind.CHANGE_PROVIDER) {
    if (!proposedProviderId) {
      fieldErrors.proposedProviderId = "Choose the proposed provider.";
    } else if (proposedProviderId === stage.currentProviderId) {
      fieldErrors.proposedProviderId = "Choose a different provider.";
    } else {
      proposed = await prisma.projectOrgProvider.findFirst({
        where: { id: proposedProviderId, projectId: opts.projectId, status: OrgProviderStatus.ACTIVE },
        select: { id: true, name: true },
      });
      if (!proposed) fieldErrors.proposedProviderId = "Choose an active registered provider.";
    }
  }
  /** @type {{ id: string; name: string }[] | null} */
  let proposedShortlist = null;
  if (kind === OrgProcurementRecommendationKind.CHANGE_SHORTLIST) {
    const ids = Array.isArray(body.proposedProviderIds)
      ? [...new Set(body.proposedProviderIds.filter((id) => typeof id === "string" && id.trim()))]
      : [];
    const currentIds = stage.currentShortlist.map((s) => s.id);
    if (!ids.length) {
      fieldErrors.proposedProviderIds = "Choose at least one provider.";
    } else if (ids.length === currentIds.length && ids.every((id) => currentIds.includes(id))) {
      fieldErrors.proposedProviderIds = "Change at least one provider.";
    } else {
      const found = await prisma.projectOrgProvider.findMany({
        where: { id: { in: ids }, projectId: opts.projectId, status: OrgProviderStatus.ACTIVE },
        select: { id: true, name: true },
      });
      if (found.length !== ids.length) {
        fieldErrors.proposedProviderIds = "Choose only active registered providers.";
      } else {
        proposedShortlist = ids.map((id) => {
          const p = found.find((f) => f.id === id);
          return { id, name: p?.name || "" };
        });
      }
    }
  }
  if (Object.keys(fieldErrors).length) {
    return { ok: false, status: 400, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const members = await resolveEligibleOrgUsers(prisma, {
    projectId: opts.projectId,
    roleName: CONTRACTS_COMMITTEE_ROLE,
  });
  if (!members.length) {
    return {
      ok: false,
      status: 400,
      error: "No active Contracts Committee members. Ask the Admin to seat the committee.",
    };
  }

  const proc = await prisma.projectOrgProcurement.findUniqueOrThrow({
    where: { id: opts.procurementId },
    select: { procurementNumber: true, title: true },
  });
  const taskTitle = `${RECOMMENDATION_TASK_PREFIX}: ${proc.procurementNumber}: ${proc.title}`.slice(0, 255);

  const created = await prisma.$transaction(async (tx) => {
    const rec = await tx.projectOrgProcurementRecommendation.create({
      data: {
        projectId: opts.projectId,
        procurementId: opts.procurementId,
        kind: /** @type {any} */ (kind),
        reason,
        details,
        alternative: alternative || null,
        currentProviderId: stage.currentProviderId,
        proposedProviderId: proposed?.id || null,
        ...(proposedShortlist
          ? { currentShortlist: stage.currentShortlist, proposedShortlist }
          : {}),
        recommendedByOrgUserId: opts.actorOrgUserId,
        recommendedByRoleName: opts.actorRoleName || null,
      },
      include: RECOMMENDATION_INCLUDE,
    });
    for (const m of members) {
      await tx.projectOrgWorkflowTask.create({
        data: {
          projectId: opts.projectId,
          instanceId,
          processFlowItemId: null,
          stepNumber: 0,
          title: taskTitle,
          requiredRoleName: CONTRACTS_COMMITTEE_ROLE,
          assigneeOrgUserId: m.id,
          status: OrgWorkflowTaskStatus.PENDING,
        },
      });
    }
    return rec;
  });

  const kindLabel = RECOMMENDATION_KIND_LABELS[kind] || kind;
  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_RECOMMENDATION_SUBMITTED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      recommendationId: created.id,
      kind,
      reason,
      proposedProviderId: proposed?.id || null,
      proposedShortlist: proposedShortlist ? proposedShortlist.map((p) => p.id) : undefined,
      remarks: `${kindLabel} — ${recommendationReasonLabel(kind, reason)}. ${details}`,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });
  try {
    await notifyOrgUsers(prisma, {
      projectId: opts.projectId,
      recipients: members,
      type: OrgNotificationType.WORKFLOW_TASK,
      title: "PDU recommendation to decide",
      body: `${kindLabel} for ${proc.procurementNumber}: ${recommendationReasonLabel(kind, reason)}.`,
      linkUrl: `/projects/${opts.projectId}/procurements/${opts.procurementId}`,
      relatedEntityType: "procurement",
      relatedEntityId: opts.procurementId,
    });
  } catch {
    // Non-fatal: the committee tasks remain the source of truth.
  }

  return { ok: true, recommendation: serializeRecommendation(created) };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   recommendationId: string;
 *   decision: string;
 *   comment?: string | null;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   committeeId: string | null;
 *   committeeRole: string | null;
 * }} opts
 */
export async function decideRecommendation(prisma, opts) {
  const decision = String(opts.decision || "").trim().toUpperCase();
  if (decision !== "APPROVE" && decision !== "DECLINE") {
    return { ok: false, status: 400, error: "Choose approve or decline." };
  }
  const comment = typeof opts.comment === "string" ? opts.comment.trim() : "";
  if (decision === "DECLINE" && !comment) {
    return {
      ok: false,
      status: 400,
      error: "Please fix the highlighted fields.",
      fieldErrors: { comment: "Enter the reason." },
    };
  }

  const task = await prisma.projectOrgWorkflowTask.findFirst({
    where: {
      projectId: opts.projectId,
      assigneeOrgUserId: opts.actorOrgUserId,
      status: OrgWorkflowTaskStatus.PENDING,
      title: { startsWith: RECOMMENDATION_TASK_PREFIX },
      instance: { procurementId: opts.procurementId },
    },
    select: { id: true, instanceId: true },
  });
  if (!task) {
    return { ok: false, status: 403, error: "You have no Contracts Committee decision on this case." };
  }

  const rec = await prisma.projectOrgProcurementRecommendation.findFirst({
    where: {
      id: opts.recommendationId,
      projectId: opts.projectId,
      procurementId: opts.procurementId,
    },
  });
  if (!rec || rec.status !== OrgProcurementRecommendationStatus.PENDING) {
    return { ok: false, status: 409, error: "This recommendation has already been decided." };
  }

  const proc = await prisma.projectOrgProcurement.findUniqueOrThrow({
    where: { id: opts.procurementId },
    select: {
      id: true,
      status: true,
      procurementNumber: true,
      officerOrgUserId: true,
      requisition: {
        select: {
          id: true,
          category: true,
          status: true,
          budgetLineId: true,
          estimatedTotalValue: true,
          form5PartII: true,
        },
      },
    },
  });

  const approve = decision === "APPROVE";
  const isCancel = rec.kind === OrgProcurementRecommendationKind.CANCEL;
  const isShortlistChange = rec.kind === OrgProcurementRecommendationKind.CHANGE_SHORTLIST;

  /** @type {any} */
  let newShortlistEntry = null;
  /** @type {any[] | null} */
  let newShortlist = null;
  if (approve && isShortlistChange) {
    const stage = await recommendationStage(prisma, opts);
    if (!stage.kinds.includes(OrgProcurementRecommendationKind.CHANGE_SHORTLIST)) {
      return { ok: false, status: 400, error: "The RFQs have already been issued." };
    }
    const ids = Array.isArray(rec.proposedShortlist)
      ? rec.proposedShortlist.map((p) => /** @type {any} */ (p)?.id).filter(Boolean)
      : [];
    const assessed = await assessProviderSelection(prisma, {
      projectId: opts.projectId,
      providerIds: ids,
      method: "QUOTATION",
      category: proc.requisition?.category || null,
    });
    if (!ids.length || !assessed.ok || assessed.providers.length !== ids.length) {
      return { ok: false, status: 400, error: "A proposed provider is no longer in the register." };
    }
    newShortlist = assessed.providers.map((p) => ({
      id: p.id,
      name: p.name,
      qualifies: p.qualifies,
      failedReasons: p.failedReasons,
    }));
  } else if (approve && !isCancel) {
    const stage = await recommendationStage(prisma, opts);
    if (!stage.allowed) {
      return { ok: false, status: 400, error: "This procurement is past award or order." };
    }
    if (!rec.proposedProviderId) {
      return { ok: false, status: 400, error: "No proposed provider on this recommendation." };
    }
    const assessed = await assessProviderSelection(prisma, {
      projectId: opts.projectId,
      providerIds: [rec.proposedProviderId],
      method: "MICRO",
      category: proc.requisition?.category || null,
    });
    if (!assessed.ok || !assessed.providers[0]) {
      return { ok: false, status: 400, error: "The proposed provider is no longer in the register." };
    }
    const p = assessed.providers[0];
    newShortlistEntry = {
      id: p.id,
      name: p.name,
      qualifies: p.qualifies,
      failedReasons: p.failedReasons,
    };
  }

  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.projectOrgProcurementRecommendation.updateMany({
        where: { id: rec.id, status: OrgProcurementRecommendationStatus.PENDING },
        data: {
          status: approve
            ? OrgProcurementRecommendationStatus.APPROVED
            : OrgProcurementRecommendationStatus.DECLINED,
          decidedByOrgUserId: opts.actorOrgUserId,
          decidedByRoleName: opts.committeeRole || opts.actorRoleName || null,
          committeeId: opts.committeeId,
          decisionComment: comment || null,
          decidedAt: now,
        },
      });
      if (claimed.count !== 1) throw new Error("ALREADY_DECIDED");

      await tx.projectOrgWorkflowTask.update({
        where: { id: task.id },
        data: { status: OrgWorkflowTaskStatus.COMPLETED, completedAt: now },
      });
      await tx.projectOrgWorkflowTask.updateMany({
        where: {
          instanceId: task.instanceId,
          status: OrgWorkflowTaskStatus.PENDING,
          title: { startsWith: RECOMMENDATION_TASK_PREFIX },
        },
        data: { status: OrgWorkflowTaskStatus.CANCELLED, completedAt: now },
      });

      if (approve && isCancel) {
        await tx.projectOrgProcurement.update({
          where: { id: proc.id },
          data: { status: OrgProcurementStatus.CANCELLED },
        });
        const instances = await tx.projectOrgWorkflowInstance.findMany({
          where: {
            procurementId: proc.id,
            status: {
              in: [
                OrgWorkflowInstanceStatus.ACTIVE,
                OrgWorkflowInstanceStatus.IN_PROGRESS,
                OrgWorkflowInstanceStatus.SUSPENDED,
              ],
            },
          },
          select: { id: true },
        });
        const instanceIds = instances.map((i) => i.id);
        if (instanceIds.length) {
          await tx.projectOrgWorkflowInstance.updateMany({
            where: { id: { in: instanceIds } },
            data: { status: OrgWorkflowInstanceStatus.CANCELLED, completedAt: now },
          });
          await tx.projectOrgWorkflowTask.updateMany({
            where: {
              instanceId: { in: instanceIds },
              status: { in: [OrgWorkflowTaskStatus.PENDING, OrgWorkflowTaskStatus.IN_PROGRESS] },
            },
            data: { status: OrgWorkflowTaskStatus.CANCELLED, completedAt: now },
          });
        }
        const req = proc.requisition;
        if (req?.budgetLineId && req.status === "APPROVED") {
          const line = await tx.projectOrgBudgetLine.findUnique({
            where: { id: req.budgetLineId },
            select: { id: true, committedAmount: true },
          });
          if (line) {
            const released = Math.max(
              0,
              Number(line.committedAmount || 0) - Number(req.estimatedTotalValue || 0),
            );
            await tx.projectOrgBudgetLine.update({
              where: { id: line.id },
              data: { committedAmount: new Prisma.Decimal(released.toFixed(2)) },
            });
          }
        }
      }

      if (approve && proc.requisition && newShortlist) {
        const partII =
          proc.requisition.form5PartII && typeof proc.requisition.form5PartII === "object"
            ? /** @type {Record<string, any>} */ (proc.requisition.form5PartII)
            : {};
        await tx.projectOrgRequisition.update({
          where: { id: proc.requisition.id },
          data: {
            form5PartII: {
              ...partII,
              shortlist: newShortlist,
              shortlistedProviders: newShortlist.map((p) => p.name).join(", "),
              shortlistValidatedAt: now.toISOString(),
              ...(newShortlist.length < MIN_RFQ_PROVIDERS && !String(partII.shortlistJustification || "").trim()
                ? { shortlistJustification: String(rec.details || "").trim() }
                : {}),
            },
          },
        });
      }

      if (approve && !isCancel && proc.requisition && newShortlistEntry) {
        const partII =
          proc.requisition.form5PartII && typeof proc.requisition.form5PartII === "object"
            ? /** @type {Record<string, any>} */ (proc.requisition.form5PartII)
            : {};
        await tx.projectOrgRequisition.update({
          where: { id: proc.requisition.id },
          data: {
            form5PartII: {
              ...partII,
              shortlist: [newShortlistEntry],
              shortlistedProviders: newShortlistEntry.name,
              shortlistValidatedAt: now.toISOString(),
            },
          },
        });
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_DECIDED") {
      return { ok: false, status: 409, error: "This recommendation has already been decided." };
    }
    throw e;
  }

  const kindLabel = RECOMMENDATION_KIND_LABELS[rec.kind] || rec.kind;
  const baseMeta = {
    projectId: opts.projectId,
    procurementId: proc.id,
    recommendationId: rec.id,
    kind: rec.kind,
    committeeId: opts.committeeId,
    committeeRole: opts.committeeRole,
    actorOrgUserId: opts.actorOrgUserId,
    actorRoleName: CONTRACTS_COMMITTEE_ROLE,
  };
  await writeAuditLog({
    eventType: approve
      ? AuditEvent.PROJECT_ORG_RECOMMENDATION_APPROVED
      : AuditEvent.PROJECT_ORG_RECOMMENDATION_DECLINED,
    actorUserId: null,
    meta: { ...baseMeta, remarks: comment || kindLabel },
  });
  if (approve && isCancel) {
    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ORG_PROCUREMENT_CANCELLED,
      actorUserId: null,
      meta: {
        ...baseMeta,
        previousStatus: proc.status,
        newStatus: OrgProcurementStatus.CANCELLED,
        remarks: recommendationReasonLabel(rec.kind, rec.reason),
      },
    });
  }
  if (approve && !isCancel && newShortlistEntry) {
    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ORG_PROCUREMENT_PROVIDER_CHANGED,
      actorUserId: null,
      meta: {
        ...baseMeta,
        previousProviderId: rec.currentProviderId,
        supplierId: newShortlistEntry.id,
        remarks: `Approved provider is now ${newShortlistEntry.name}.`,
      },
    });
  }

  if (approve && newShortlist) {
    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ORG_PROCUREMENT_PROVIDER_CHANGED,
      actorUserId: null,
      meta: {
        ...baseMeta,
        previousShortlist: Array.isArray(rec.currentShortlist)
          ? rec.currentShortlist.map((p) => /** @type {any} */ (p)?.id)
          : [],
        shortlist: newShortlist.map((p) => p.id),
        remarks: `Approved shortlist is now ${newShortlist.map((p) => p.name).join(", ")}.`,
      },
    });
  }

  if (approve && isCancel) {
    await notifyProvider(prisma, {
      projectId: opts.projectId,
      providerId: rec.currentProviderId,
      procurementId: proc.id,
      title: `Procurement cancelled: ${proc.procurementNumber}`,
      body: "The organisation has cancelled this procurement.",
    });
  }
  if (approve && !isCancel && newShortlistEntry) {
    if (rec.currentProviderId && rec.currentProviderId !== newShortlistEntry.id) {
      await notifyProvider(prisma, {
        projectId: opts.projectId,
        providerId: rec.currentProviderId,
        linkUrl: "/provider-portal",
        relatedEntityType: "procurement",
        relatedEntityId: proc.id,
        title: `No longer selected: ${proc.procurementNumber}`,
        body: "The organisation has chosen another provider for this procurement.",
      });
    }
    await notifyProvider(prisma, {
      projectId: opts.projectId,
      providerId: newShortlistEntry.id,
      procurementId: proc.id,
      title: `You have been selected: ${proc.procurementNumber}`,
      body: "You are the approved provider. A purchase instruction will follow.",
    });
  }

  const recipientIds = [...new Set([rec.recommendedByOrgUserId, proc.officerOrgUserId].filter(Boolean))];
  if (recipientIds.length) {
    try {
      const recipients = await prisma.projectOrgUser.findMany({
        where: { id: { in: /** @type {string[]} */ (recipientIds) } },
        select: { id: true, linkedUserId: true },
      });
      await notifyOrgUsers(prisma, {
        projectId: opts.projectId,
        recipients,
        type: approve ? OrgNotificationType.WORKFLOW_APPROVED : OrgNotificationType.WORKFLOW_REJECTED,
        title: approve ? "Recommendation approved" : "Recommendation declined",
        body: `${kindLabel} for ${proc.procurementNumber} was ${approve ? "approved" : "declined"} by the Contracts Committee.${comment ? ` ${comment}` : ""}`,
        linkUrl: `/projects/${opts.projectId}/procurements/${proc.id}`,
        relatedEntityType: "procurement",
        relatedEntityId: proc.id,
      });
    } catch {
      // Non-fatal.
    }
  }

  return { ok: true, decision, kind: rec.kind };
}
