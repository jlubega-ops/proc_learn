/**
 * Derive organisation procurement progress from the real domain (read-only).
 * Does NOT invent a second workflow engine — stages reflect FY / budgets / plans /
 * requisitions / procurement case statuses already stored by the simulation.
 */
import {
  OrgBudgetStatus,
  OrgProcurementPlanStatus,
  OrgProcurementStatus,
  OrgRequisitionStatus,
  OrgWorkflowTaskStatus,
  Role,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgOpsSlateListWhere, resolveCurrentOrgSlateId } from "@/lib/academic/org-academic-slate";
import { formatUserDisplayName } from "@/lib/user-display";
import { PROCESS_FLOW_CODES } from "@/lib/projects/process-catalogue";
import { resolveEffectiveProcessCodes } from "@/lib/academic/programme-processes";

/** @typedef {'done'|'current'|'todo'|'blocked'} StageState */

/**
 * Macro teaching stages shown to Examiners (human labels).
 * Ordering follows the educational procurement path used in Proc Learn.
 */
export const OBSERVATION_STAGE_KEYS = [
  "FINANCIAL_YEAR",
  "BUDGET",
  "PROCUREMENT_PLANNING",
  "REQUISITION",
  "APPROVAL",
  "PROCUREMENT_METHOD",
  "EVALUATION",
  "CONTRACT",
  "DELIVERY",
  "CLOSURE",
];

/** @type {Record<string, string>} */
export const OBSERVATION_STAGE_LABELS = {
  FINANCIAL_YEAR: "Financial Year",
  BUDGET: "Budget",
  PROCUREMENT_PLANNING: "Procurement Planning",
  REQUISITION: "Requisition",
  APPROVAL: "Approval",
  PROCUREMENT_METHOD: "Procurement Method",
  EVALUATION: "Evaluation",
  CONTRACT: "Contract / LPO",
  DELIVERY: "Delivery",
  CLOSURE: "Closure",
};

const BUDGET_RANK = {
  [OrgBudgetStatus.DRAFT]: 1,
  [OrgBudgetStatus.SUBMITTED]: 2,
  [OrgBudgetStatus.UNDER_REVIEW]: 3,
  [OrgBudgetStatus.RETURNED]: 2,
  [OrgBudgetStatus.REJECTED]: 0,
  [OrgBudgetStatus.APPROVED]: 4,
  [OrgBudgetStatus.CLOSED]: 4,
};

const PLAN_RANK = {
  [OrgProcurementPlanStatus.DRAFT]: 1,
  [OrgProcurementPlanStatus.SUBMITTED]: 2,
  [OrgProcurementPlanStatus.UNDER_REVIEW]: 3,
  [OrgProcurementPlanStatus.RETURNED]: 2,
  [OrgProcurementPlanStatus.REJECTED]: 0,
  [OrgProcurementPlanStatus.APPROVED]: 4,
  [OrgProcurementPlanStatus.CANCELLED]: 0,
  [OrgProcurementPlanStatus.CLOSED]: 4,
};

const REQ_RANK = {
  [OrgRequisitionStatus.DRAFT]: 1,
  [OrgRequisitionStatus.SUBMITTED]: 2,
  [OrgRequisitionStatus.UNDER_REVIEW]: 3,
  [OrgRequisitionStatus.RETURNED]: 2,
  [OrgRequisitionStatus.REJECTED]: 0,
  [OrgRequisitionStatus.APPROVED]: 4,
  [OrgRequisitionStatus.CANCELLED]: 0,
};

/** Post-method procurement status → furthest macro stage key reached */
const PROC_STATUS_STAGE = {
  [OrgProcurementStatus.DRAFT]: "PROCUREMENT_METHOD",
  [OrgProcurementStatus.METHOD_SELECTED]: "PROCUREMENT_METHOD",
  [OrgProcurementStatus.IN_PROGRESS]: "PROCUREMENT_METHOD",
  [OrgProcurementStatus.SOLICITATION]: "PROCUREMENT_METHOD",
  [OrgProcurementStatus.EVALUATION]: "EVALUATION",
  [OrgProcurementStatus.AWARD_PENDING]: "EVALUATION",
  [OrgProcurementStatus.AWARDED]: "EVALUATION",
  [OrgProcurementStatus.CONTRACTING]: "CONTRACT",
  [OrgProcurementStatus.CONTRACT_ACTIVE]: "CONTRACT",
  [OrgProcurementStatus.DELIVERY]: "DELIVERY",
  [OrgProcurementStatus.INSPECTION]: "DELIVERY",
  [OrgProcurementStatus.INVOICING]: "CLOSURE",
  [OrgProcurementStatus.PAYMENT]: "CLOSURE",
  [OrgProcurementStatus.READY_FOR_CLOSURE]: "CLOSURE",
  [OrgProcurementStatus.CLOSED]: "CLOSURE",
  [OrgProcurementStatus.CANCELLED]: null,
  [OrgProcurementStatus.REJECTED]: null,
};

/**
 * @param {StageState} state
 */
export function stageMarker(state) {
  if (state === "done") return "✓";
  if (state === "current") return "→";
  if (state === "blocked") return "!";
  return "○";
}

/**
 * @param {any} actor
 */
function actorLabel(actor) {
  if (!actor) return null;
  const name = formatUserDisplayName(actor);
  if (name) return name;
  return actor.email || null;
}

/**
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => number} rankFn
 */
function pickBestByRank(rows, rankFn) {
  let best = null;
  let bestRank = -1;
  for (const row of rows) {
    const r = rankFn(row);
    if (r > bestRank) {
      best = row;
      bestRank = r;
    }
  }
  return best;
}

/** @param {string} status */
function humanStatus(status) {
  return String(status || "")
    .toLowerCase()
    .replace(/_/g, " ");
}

const METHOD_PROCESS_CODES = [
  PROCESS_FLOW_CODES.MICRO_PROCUREMENT,
  PROCESS_FLOW_CODES.QUOTATION_PROCESS,
  PROCESS_FLOW_CODES.TENDER_PROCESS,
];

/** Stage → processes that make it reachable (any of). Financial Year is always tracked. */
const STAGE_PROCESS_CODES = {
  BUDGET: [PROCESS_FLOW_CODES.BUDGETING],
  PROCUREMENT_PLANNING: [PROCESS_FLOW_CODES.PROCUREMENT_PLANNING],
  REQUISITION: [PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION],
  APPROVAL: [PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION],
  PROCUREMENT_METHOD: METHOD_PROCESS_CODES,
  EVALUATION: [PROCESS_FLOW_CODES.EVALUATION_PROCESS],
  CONTRACT: [PROCESS_FLOW_CODES.LPO_PROCESS, PROCESS_FLOW_CODES.CONTRACT_PROCESS],
  DELIVERY: [PROCESS_FLOW_CODES.INVOICE_PROCESS],
  CLOSURE: [PROCESS_FLOW_CODES.PAYMENT_PROCESS],
};

/**
 * Stages on the organisation's allowed path (all stages when unrestricted).
 * @param {string[] | null | undefined} allowedCodes
 */
export function trackedStageKeys(allowedCodes) {
  if (!allowedCodes) return OBSERVATION_STAGE_KEYS;
  const allowed = new Set(allowedCodes);
  return OBSERVATION_STAGE_KEYS.filter((key) => {
    const codes = STAGE_PROCESS_CODES[key];
    return !codes || codes.some((c) => allowed.has(c));
  });
}

/**
 * Mark all stages before `key` as done.
 * @param {Record<string, boolean>} done
 * @param {string} key
 */
function markBeforeDone(done, key) {
  const idx = OBSERVATION_STAGE_KEYS.indexOf(key);
  for (let i = 0; i < idx; i += 1) {
    done[OBSERVATION_STAGE_KEYS[i]] = true;
  }
}

/**
 * Shared stage-state computation (list summaries + full observation).
 * Does not write procurement data.
 *
 * @param {{
 *   activeFy?: any;
 *   bestBudget?: any;
 *   bestPlan?: any;
 *   bestReq?: any;
 *   bestProc?: any;
 * }} snaps
 * @param {string[] | null} [allowedCodes] effective process codes; null = full path
 */
export function computeObservationStageStates(snaps = {}, allowedCodes = null) {
  const activeFy = snaps.activeFy || null;
  const bestBudget = snaps.bestBudget || null;
  const bestPlan = snaps.bestPlan || null;
  const bestReq = snaps.bestReq || null;
  const bestProc = snaps.bestProc || null;

  /** @type {Record<string, boolean>} */
  const done = {
    FINANCIAL_YEAR: Boolean(activeFy),
    BUDGET: Boolean(bestBudget && (BUDGET_RANK[bestBudget.status] || 0) >= 4),
    PROCUREMENT_PLANNING: Boolean(bestPlan && (PLAN_RANK[bestPlan.status] || 0) >= 4),
    REQUISITION: Boolean(bestReq && (REQ_RANK[bestReq.status] || 0) >= 2),
    APPROVAL: Boolean(bestReq && bestReq.status === OrgRequisitionStatus.APPROVED),
    PROCUREMENT_METHOD: false,
    EVALUATION: false,
    CONTRACT: false,
    DELIVERY: false,
    CLOSURE: false,
  };

  if (
    bestProc &&
    bestProc.status !== OrgProcurementStatus.CANCELLED &&
    bestProc.status !== OrgProcurementStatus.REJECTED
  ) {
    const mapped = PROC_STATUS_STAGE[bestProc.status];
    if (mapped) {
      markBeforeDone(done, mapped);
      if (bestProc.status === OrgProcurementStatus.CLOSED) {
        for (const key of OBSERVATION_STAGE_KEYS) done[key] = true;
      } else if (
        [
          OrgProcurementStatus.METHOD_SELECTED,
          OrgProcurementStatus.IN_PROGRESS,
          OrgProcurementStatus.SOLICITATION,
        ].includes(bestProc.status)
      ) {
        done.PROCUREMENT_METHOD = true;
      } else {
        const mappedIdx = OBSERVATION_STAGE_KEYS.indexOf(mapped);
        for (let i = 0; i < mappedIdx; i += 1) {
          done[OBSERVATION_STAGE_KEYS[i]] = true;
        }
      }
    }
  }

  const tracked = trackedStageKeys(allowedCodes);
  const lastKey = tracked[tracked.length - 1];
  const finished = tracked.every((key) => done[key]);
  const currentKey = tracked.find((key) => !done[key]) || (finished ? lastKey : tracked[0]);

  const stages = tracked.map((key) => {
    /** @type {StageState} */
    let state = "todo";
    if (done[key]) state = "done";
    else if (key === currentKey) state = "current";
    return {
      key,
      label: OBSERVATION_STAGE_LABELS[key],
      marker: stageMarker(state),
      state,
    };
  });

  const completedCount = stages.filter((s) => s.state === "done").length;
  const currentStage = stages.find((s) => s.state === "current") || null;

  return {
    done,
    currentKey,
    stages,
    summary: {
      completedCount,
      totalCount: stages.length,
      percent: Math.round((completedCount / Math.max(stages.length, 1)) * 100),
      currentStageKey: currentStage?.key || (finished ? lastKey : null),
      currentStageLabel: currentStage?.label || (finished ? OBSERVATION_STAGE_LABELS[lastKey] : null),
      remainingCount: stages.filter((s) => s.state === "todo" || s.state === "current").length,
    },
  };
}

/**
 * @param {string} projectId
 * @param {{ db?: import("@prisma/client").PrismaClient }} [opts]
 */
export async function deriveOrganisationProcurementProgress(projectId, opts = {}) {
  const db = opts.db || prisma;
  let slateWhere = {};
  try {
    const slateId = await resolveCurrentOrgSlateId(db, projectId);
    slateWhere = orgOpsSlateListWhere(slateId);
  } catch {
    slateWhere = {};
  }

  const orgUserSelect = {
    firstName: true,
    lastName: true,
    email: true,
  };

  const [financialYears, budgets, plans, requisitions, procurements, openTasks] = await Promise.all([
    db.projectOrgFinancialYear.findMany({
      where: { projectId },
      orderBy: { startDate: "desc" },
      take: 20,
    }),
    db.projectOrgBudget.findMany({
      where: { projectId, ...slateWhere },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        createdBy: { select: orgUserSelect },
        approvedBy: { select: orgUserSelect },
        department: { select: { name: true } },
      },
    }),
    db.projectOrgProcurementPlan.findMany({
      where: { projectId, ...slateWhere },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        createdBy: { select: orgUserSelect },
        approvedBy: { select: orgUserSelect },
        department: { select: { name: true } },
      },
    }),
    db.projectOrgRequisition.findMany({
      where: { projectId, ...slateWhere },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        requester: { select: orgUserSelect },
        approvedBy: { select: orgUserSelect },
        department: { select: { name: true } },
      },
    }),
    db.projectOrgProcurement.findMany({
      where: { projectId, ...slateWhere },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    db.projectOrgWorkflowTask.findMany({
      where: {
        projectId,
        status: { in: [OrgWorkflowTaskStatus.PENDING, OrgWorkflowTaskStatus.IN_PROGRESS] },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        assignee: { select: orgUserSelect },
      },
    }),
  ]);

  const activeFy = financialYears.find((fy) => fy.isActive) || financialYears[0] || null;
  const bestBudget = pickBestByRank(budgets, (b) => BUDGET_RANK[b.status] ?? 0);
  const bestPlan = pickBestByRank(plans, (p) => PLAN_RANK[p.status] ?? 0);
  const bestReq = pickBestByRank(requisitions, (r) => REQ_RANK[r.status] ?? 0);
  const bestProc = procurements[0] || null;
  const openTask = openTasks[0] || null;

  const allowedCodes = await resolveEffectiveProcessCodes(db, projectId).catch(() => null);
  const computed = computeObservationStageStates(
    { activeFy, bestBudget, bestPlan, bestReq, bestProc },
    allowedCodes,
  );

  const stages = computed.stages.map((stage) => {
    const detail = stageDetail({
      key: stage.key,
      activeFy,
      bestBudget,
      bestPlan,
      bestReq,
      bestProc,
      openTask,
    });
    return { ...stage, ...detail };
  });

  const remaining = stages.filter((s) => s.state === "todo" || s.state === "current");

  return {
    projectId,
    stages,
    remainingStages: remaining.map((s) => ({
      key: s.key,
      label: s.label,
      state: s.state,
    })),
    summary: computed.summary,
    counts: {
      financialYears: financialYears.length,
      budgets: budgets.length,
      plans: plans.length,
      requisitions: requisitions.length,
      procurements: procurements.length,
      openTasks: openTasks.length,
    },
    highlights: {
      financialYear: activeFy
        ? { id: activeFy.id, label: activeFy.label, isActive: activeFy.isActive }
        : null,
      budget: bestBudget
        ? {
            id: bestBudget.id,
            title: bestBudget.title,
            status: bestBudget.status,
            department: bestBudget.department?.name || null,
            createdBy: actorLabel(bestBudget.createdBy),
            approvedBy: actorLabel(bestBudget.approvedBy),
            updatedAt: bestBudget.updatedAt,
          }
        : null,
      plan: bestPlan
        ? {
            id: bestPlan.id,
            title: bestPlan.title,
            status: bestPlan.status,
            department: bestPlan.department?.name || null,
            createdBy: actorLabel(bestPlan.createdBy),
            approvedBy: actorLabel(bestPlan.approvedBy),
            updatedAt: bestPlan.updatedAt,
          }
        : null,
      requisition: bestReq
        ? {
            id: bestReq.id,
            title: bestReq.title,
            status: bestReq.status,
            requisitionReference: bestReq.requisitionReference || null,
            department: bestReq.department?.name || null,
            requester: actorLabel(bestReq.requester),
            approvedBy: actorLabel(bestReq.approvedBy),
            updatedAt: bestReq.updatedAt,
          }
        : null,
      procurement: bestProc
        ? {
            id: bestProc.id,
            procurementNumber: bestProc.procurementNumber,
            status: bestProc.status,
            method: bestProc.procurementMethod || null,
            title: bestProc.title || null,
            updatedAt: bestProc.updatedAt,
          }
        : null,
      openTask: openTask
        ? {
            id: openTask.id,
            title: openTask.title,
            status: openTask.status,
            role: openTask.requiredRoleName || null,
            assignee: actorLabel(openTask.assignee),
            createdAt: openTask.createdAt,
          }
        : null,
    },
    records: {
      budgets: budgets.slice(0, 10).map((b) => ({
        id: b.id,
        title: b.title,
        status: b.status,
        updatedAt: b.updatedAt,
        actor: actorLabel(b.approvedBy) || actorLabel(b.createdBy),
      })),
      plans: plans.slice(0, 10).map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        updatedAt: p.updatedAt,
        actor: actorLabel(p.approvedBy) || actorLabel(p.createdBy),
      })),
      requisitions: requisitions.slice(0, 10).map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        requisitionReference: r.requisitionReference || null,
        updatedAt: r.updatedAt,
        actor: actorLabel(r.approvedBy) || actorLabel(r.requester),
      })),
      procurements: procurements.slice(0, 10).map((p) => ({
        id: p.id,
        procurementNumber: p.procurementNumber,
        status: p.status,
        method: p.procurementMethod || null,
        title: p.title || null,
        updatedAt: p.updatedAt,
      })),
    },
  };
}

/**
 * @param {{
 *   key: string;
 *   activeFy: any;
 *   bestBudget: any;
 *   bestPlan: any;
 *   bestReq: any;
 *   bestProc: any;
 *   openTask: any;
 * }} p
 */
function stageDetail(p) {
  const base = {
    status: null,
    responsibleActor: null,
    occurredAt: null,
    completedAction: null,
    currentAction: null,
    nextAction: null,
    relatedRecord: null,
  };

  switch (p.key) {
    case "FINANCIAL_YEAR":
      return {
        ...base,
        status: p.activeFy ? (p.activeFy.isActive ? "Active" : "Present") : "Not set",
        completedAction: p.activeFy ? "Financial year available" : null,
        currentAction: !p.activeFy ? "Set up a financial year" : null,
        nextAction: p.activeFy ? "Prepare department budgets" : "Create financial year",
        relatedRecord: p.activeFy
          ? { type: "financialYear", id: p.activeFy.id, label: p.activeFy.label }
          : null,
        occurredAt: p.activeFy?.updatedAt || p.activeFy?.createdAt || null,
      };
    case "BUDGET":
      return {
        ...base,
        status: p.bestBudget?.status || "Not started",
        responsibleActor: actorLabel(p.bestBudget?.approvedBy) || actorLabel(p.bestBudget?.createdBy),
        occurredAt: p.bestBudget?.updatedAt || null,
        completedAction:
          p.bestBudget?.status === OrgBudgetStatus.APPROVED ? "Budget approved" : null,
        currentAction:
          p.bestBudget && p.bestBudget.status !== OrgBudgetStatus.APPROVED
            ? `Budget ${humanStatus(p.bestBudget.status)}`
            : null,
        nextAction:
          !p.bestBudget || p.bestBudget.status !== OrgBudgetStatus.APPROVED
            ? "Complete and approve a department budget"
            : "Create a procurement plan",
        relatedRecord: p.bestBudget
          ? { type: "budget", id: p.bestBudget.id, label: p.bestBudget.title }
          : null,
      };
    case "PROCUREMENT_PLANNING":
      return {
        ...base,
        status: p.bestPlan?.status || "Not started",
        responsibleActor: actorLabel(p.bestPlan?.approvedBy) || actorLabel(p.bestPlan?.createdBy),
        occurredAt: p.bestPlan?.updatedAt || null,
        completedAction:
          p.bestPlan?.status === OrgProcurementPlanStatus.APPROVED
            ? "Procurement plan approved"
            : null,
        currentAction:
          p.bestPlan && p.bestPlan.status !== OrgProcurementPlanStatus.APPROVED
            ? `Plan ${humanStatus(p.bestPlan.status)}`
            : null,
        nextAction:
          !p.bestPlan || p.bestPlan.status !== OrgProcurementPlanStatus.APPROVED
            ? "Submit and approve a procurement plan"
            : "Raise a requisition",
        relatedRecord: p.bestPlan
          ? { type: "plan", id: p.bestPlan.id, label: p.bestPlan.title }
          : null,
      };
    case "REQUISITION":
      return {
        ...base,
        status: p.bestReq?.status || "Not started",
        responsibleActor: actorLabel(p.bestReq?.requester),
        occurredAt: p.bestReq?.updatedAt || null,
        completedAction: p.bestReq ? "Requisition created" : null,
        currentAction: p.bestReq
          ? `Requisition ${humanStatus(p.bestReq.status)}`
          : "No requisition yet",
        nextAction: !p.bestReq ? "Draft a requisition from an approved plan" : "Continue approval",
        relatedRecord: p.bestReq
          ? {
              type: "requisition",
              id: p.bestReq.id,
              label: p.bestReq.requisitionReference || p.bestReq.title,
            }
          : null,
      };
    case "APPROVAL":
      return {
        ...base,
        status: p.bestReq?.status || "Waiting",
        responsibleActor:
          actorLabel(p.bestReq?.approvedBy) ||
          actorLabel(p.openTask?.assignee) ||
          p.openTask?.requiredRoleName ||
          null,
        occurredAt: p.bestReq?.approvedAt || p.bestReq?.updatedAt || null,
        completedAction:
          p.bestReq?.status === OrgRequisitionStatus.APPROVED ? "Requisition approved" : null,
        currentAction:
          p.bestReq?.status === OrgRequisitionStatus.APPROVED
            ? null
            : p.openTask
              ? p.openTask.title
              : "Awaiting approval",
        nextAction:
          p.bestReq?.status === OrgRequisitionStatus.APPROVED
            ? "Select a procurement method"
            : "Complete outstanding approval tasks",
        relatedRecord: p.bestReq
          ? {
              type: "requisition",
              id: p.bestReq.id,
              label: p.bestReq.requisitionReference || p.bestReq.title,
            }
          : null,
      };
    case "PROCUREMENT_METHOD":
      return {
        ...base,
        status: p.bestProc?.procurementMethod || p.bestProc?.status || "Not selected",
        occurredAt: p.bestProc?.methodSelectedAt || p.bestProc?.updatedAt || null,
        completedAction: p.bestProc?.procurementMethod
          ? `Method: ${p.bestProc.procurementMethod}`
          : null,
        currentAction: !p.bestProc?.procurementMethod
          ? "Select Micro, Quotation, or Tender"
          : null,
        nextAction: p.bestProc?.procurementMethod
          ? "Continue solicitation / evaluation"
          : "Select method",
        relatedRecord: p.bestProc
          ? {
              type: "procurement",
              id: p.bestProc.id,
              label: p.bestProc.procurementNumber,
            }
          : null,
      };
    case "EVALUATION":
      return {
        ...base,
        status: p.bestProc?.status || "Not started",
        occurredAt: p.bestProc?.updatedAt || null,
        currentAction:
          p.bestProc?.status === OrgProcurementStatus.EVALUATION
            ? "Evaluation in progress"
            : null,
        nextAction: "Complete evaluation and award",
        relatedRecord: p.bestProc
          ? { type: "procurement", id: p.bestProc.id, label: p.bestProc.procurementNumber }
          : null,
      };
    case "CONTRACT":
      return {
        ...base,
        status: p.bestProc?.status || "Not started",
        occurredAt: p.bestProc?.updatedAt || null,
        currentAction:
          p.bestProc?.status === OrgProcurementStatus.CONTRACTING
            ? "Contracting in progress"
            : null,
        nextAction: "Issue contract or LPO, then take delivery",
        relatedRecord: p.bestProc
          ? { type: "procurement", id: p.bestProc.id, label: p.bestProc.procurementNumber }
          : null,
      };
    case "DELIVERY":
      return {
        ...base,
        status: p.bestProc?.status || "Not started",
        occurredAt: p.bestProc?.updatedAt || null,
        currentAction:
          p.bestProc?.status === OrgProcurementStatus.DELIVERY ||
          p.bestProc?.status === OrgProcurementStatus.INSPECTION
            ? "Delivery or inspection in progress"
            : null,
        nextAction: "Record delivery, then invoice and pay",
        relatedRecord: p.bestProc
          ? { type: "procurement", id: p.bestProc.id, label: p.bestProc.procurementNumber }
          : null,
      };
    case "CLOSURE":
      return {
        ...base,
        status: p.bestProc?.status || "Not started",
        occurredAt: p.bestProc?.closedAt || p.bestProc?.updatedAt || null,
        completedAction:
          p.bestProc?.status === OrgProcurementStatus.CLOSED ? "Procurement closed" : null,
        currentAction:
          p.bestProc &&
          [
            OrgProcurementStatus.INVOICING,
            OrgProcurementStatus.PAYMENT,
            OrgProcurementStatus.READY_FOR_CLOSURE,
          ].includes(p.bestProc.status)
            ? "Invoice / payment / ready to close"
            : null,
        nextAction:
          p.bestProc?.status === OrgProcurementStatus.CLOSED
            ? null
            : "Complete payment and close the case",
        relatedRecord: p.bestProc
          ? { type: "procurement", id: p.bestProc.id, label: p.bestProc.procurementNumber }
          : null,
      };
    default:
      return base;
  }
}

/**
 * Batch current-stage summaries for students' personal organisations (roster).
 * Read-only — does not mutate procurement records.
 *
 * @param {string[]} ownerUserIds
 * @param {{ db?: import("@prisma/client").PrismaClient }} [opts]
 * @returns {Promise<Map<string, {
 *   organisation: { projectId: string; name: string; projectCode: string | null; status: string };
 *   summary: ReturnType<typeof computeObservationStageStates>['summary'];
 *   openTask: { title: string; role: string | null; assignee: string | null } | null;
 * }>>}
 */
export async function listPersonalOrgProgressSummaries(ownerUserIds, opts = {}) {
  const db = opts.db || prisma;
  /** @type {Map<string, any>} */
  const byOwner = new Map();
  const ids = [...new Set((ownerUserIds || []).filter(Boolean))];
  if (ids.length === 0) return byOwner;

  const orgs = await db.project.findMany({
    where: {
      ownerUserId: { in: ids },
      isPersonalOrg: true,
      creatorRole: Role.STUDENT,
    },
    select: {
      id: true,
      ownerUserId: true,
      name: true,
      organizationName: true,
      projectCode: true,
      status: true,
    },
  });
  if (orgs.length === 0) return byOwner;

  const projectIds = orgs.map((o) => o.id);
  const orgUserSelect = {
    firstName: true,
    lastName: true,
    email: true,
  };

  const [financialYears, budgets, plans, requisitions, procurements, openTasks] = await Promise.all([
    db.projectOrgFinancialYear.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true, projectId: true, isActive: true, startDate: true },
      orderBy: { startDate: "desc" },
    }),
    db.projectOrgBudget.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true, projectId: true, status: true },
    }),
    db.projectOrgProcurementPlan.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true, projectId: true, status: true },
    }),
    db.projectOrgRequisition.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true, projectId: true, status: true },
    }),
    db.projectOrgProcurement.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true, projectId: true, status: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.projectOrgWorkflowTask.findMany({
      where: {
        projectId: { in: projectIds },
        status: { in: [OrgWorkflowTaskStatus.PENDING, OrgWorkflowTaskStatus.IN_PROGRESS] },
      },
      orderBy: { createdAt: "desc" },
      include: { assignee: { select: orgUserSelect } },
    }),
  ]);

  /** @param {any[]} rows */
  const groupByProject = (rows) => {
    /** @type {Map<string, any[]>} */
    const map = new Map();
    for (const row of rows) {
      const list = map.get(row.projectId) || [];
      list.push(row);
      map.set(row.projectId, list);
    }
    return map;
  };

  const allowedEntries = await Promise.all(
    orgs.map(async (o) => [o.id, await resolveEffectiveProcessCodes(db, o.id).catch(() => null)]),
  );
  /** @type {Map<string, string[] | null>} */
  const allowedBy = new Map(/** @type {any} */ (allowedEntries));
  const fyBy = groupByProject(financialYears);
  const budgetBy = groupByProject(budgets);
  const planBy = groupByProject(plans);
  const reqBy = groupByProject(requisitions);
  const procBy = groupByProject(procurements);
  const taskBy = groupByProject(openTasks);

  for (const org of orgs) {
    const fys = fyBy.get(org.id) || [];
    const activeFy = fys.find((fy) => fy.isActive) || fys[0] || null;
    const bestBudget = pickBestByRank(budgetBy.get(org.id) || [], (b) => BUDGET_RANK[b.status] ?? 0);
    const bestPlan = pickBestByRank(planBy.get(org.id) || [], (p) => PLAN_RANK[p.status] ?? 0);
    const bestReq = pickBestByRank(reqBy.get(org.id) || [], (r) => REQ_RANK[r.status] ?? 0);
    const bestProc = (procBy.get(org.id) || [])[0] || null;
    const openTask = (taskBy.get(org.id) || [])[0] || null;
    const computed = computeObservationStageStates(
      { activeFy, bestBudget, bestPlan, bestReq, bestProc },
      allowedBy.get(org.id) ?? null,
    );
    byOwner.set(org.ownerUserId, {
      organisation: {
        projectId: org.id,
        name: org.name,
        displayName: org.organizationName || org.name,
        projectCode: org.projectCode,
        status: org.status,
      },
      summary: computed.summary,
      counts: {
        budgets: (budgetBy.get(org.id) || []).length,
        plans: (planBy.get(org.id) || []).length,
        requisitions: (reqBy.get(org.id) || []).length,
        procurements: (procBy.get(org.id) || []).length,
      },
      lastActivityAt: bestProc?.updatedAt || null,
      openTask: openTask
        ? {
            title: openTask.title,
            role: openTask.requiredRoleName || null,
            assignee: actorLabel(openTask.assignee),
          }
        : null,
    });
  }

  return byOwner;
}
