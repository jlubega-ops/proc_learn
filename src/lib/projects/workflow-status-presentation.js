/**
 * Shared organisation workflow status labels and decision button copy.
 * Keep chips consistent: Draft → Submitted → Pending approval by X →
 * Pending your action (assignee) → Approved / Rejected by X / Returned….
 */

/** @type {Record<string, string>} */
const ROLE_SHORT = {
  "Head User Department": "HOD",
  "Head of User Department": "HOD",
  "Accounting Officer": "AO",
  "Finance/Budget Officer": "Finance/Budget Officer",
  "User Department Officer": "User Department",
  "User Department": "User Department",
  "Head PDU": "Head PDU",
  "Contracts Committee": "Contracts Committee",
};

/**
 * @param {unknown} roleName
 */
export function shortOrgRoleName(roleName) {
  const raw = String(roleName || "").trim();
  if (!raw) return "";
  return ROLE_SHORT[raw] || raw;
}

/**
 * @param {{
 *   status?: string | null;
 *   workflowStage?: { requiredRoleName?: string | null; title?: string | null } | null;
 *   viewerHasPendingAction?: boolean;
 *   lastDecision?: { decision?: string | null; actorRoleName?: string | null } | null;
 * }} opts
 * @returns {{ label: string; color: "success" | "error" | "warning" | "info" | "primary" }}
 */
export function presentOrgWorkflowStatus(opts) {
  const status = String(opts?.status || "").trim().toUpperCase();
  const stage = opts?.workflowStage || null;
  const pendingForViewer = Boolean(opts?.viewerHasPendingAction);
  const last = opts?.lastDecision || null;
  const lastDecision = String(last?.decision || "").trim().toUpperCase();
  const lastRole = shortOrgRoleName(last?.actorRoleName);

  if (status === "APPROVED") {
    return { label: "Approved", color: "success" };
  }
  if (status === "CLOSED") {
    return { label: "Closed", color: "error" };
  }
  if (status === "DRAFT") {
    return { label: "Draft", color: "info" };
  }
  if (status === "REJECTED") {
    return {
      label: lastDecision === "REJECT" && lastRole ? `Rejected by ${lastRole}` : "Rejected",
      color: "error",
    };
  }
  if (status === "RETURNED") {
    return {
      label:
        (lastDecision === "RETURN" || lastDecision === "RETURNED") && lastRole
          ? `Returned for correction by ${lastRole}`
          : "Returned for correction",
      color: "warning",
    };
  }

  if (status === "SUBMITTED" || status === "UNDER_REVIEW") {
    if (pendingForViewer) {
      return { label: "Pending your action", color: "warning" };
    }
    const role = shortOrgRoleName(stage?.requiredRoleName);
    if (role) {
      return { label: `Pending approval by ${role}`, color: "warning" };
    }
    return { label: "Submitted", color: "warning" };
  }

  return { label: status || "—", color: "info" };
}

/**
 * Primary action button label for workflow decision forms.
 * @param {string} decision
 * @param {{ busy?: boolean }} [opts]
 */
export function workflowDecisionButtonLabel(decision, opts = {}) {
  if (opts.busy) return "Saving…";
  const d = String(decision || "").trim().toUpperCase();
  if (d === "APPROVE") return "Approve";
  if (d === "RETURN") return "Return for correction";
  if (d === "REJECT") return "Reject";
  if (d === "SELECT_METHOD") return "Select method";
  if (d === "COMPLETE") return "Complete";
  if (d === "SUBMIT") return "Submit";
  if (d === "VERIFY") return "Verify";
  if (d === "FLAG_EXCEPTION") return "Flag exception";
  return "Confirm";
}

/**
 * Load current pending stage + last decision + whether the viewer is the assignee,
 * keyed by entity id (budget / plan / requisition).
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   entityField: "budgetId" | "procurementPlanId" | "requisitionId";
 *   entityIds: string[];
 *   viewerOrgUserId?: string | null;
 * }} opts
 * @returns {Promise<Map<string, {
 *   workflowStage: { taskId: string; title: string; requiredRoleName: string | null; stepNumber: number; status: string } | null;
 *   lastDecision: { decision: string; actorRoleName: string | null } | null;
 *   viewerHasPendingAction: boolean;
 * }>>}
 */
export async function mapEntityWorkflowContexts(prisma, opts) {
  /** @type {Map<string, any>} */
  const map = new Map();
  const ids = (opts.entityIds || []).filter(Boolean);
  if (!ids.length) return map;

  for (const id of ids) {
    map.set(id, {
      workflowStage: null,
      lastDecision: null,
      viewerHasPendingAction: false,
    });
  }

  const field = opts.entityField;
  const tasks = await prisma.projectOrgWorkflowTask.findMany({
    where: {
      projectId: opts.projectId,
      status: { in: ["PENDING", "IN_PROGRESS"] },
      instance: {
        [field]: { in: ids },
        status: { in: ["ACTIVE", "IN_PROGRESS", "SUSPENDED"] },
      },
    },
    orderBy: [{ stepNumber: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      requiredRoleName: true,
      stepNumber: true,
      status: true,
      assigneeOrgUserId: true,
      instance: { select: { budgetId: true, procurementPlanId: true, requisitionId: true } },
    },
  });

  for (const task of tasks) {
    const entityId = task.instance?.[field];
    if (!entityId || !map.has(entityId)) continue;
    const entry = map.get(entityId);
    if (!entry.workflowStage) {
      entry.workflowStage = {
        taskId: task.id,
        title: task.title,
        requiredRoleName: task.requiredRoleName || null,
        stepNumber: task.stepNumber,
        status: task.status,
      };
    }
    if (
      opts.viewerOrgUserId &&
      task.assigneeOrgUserId === opts.viewerOrgUserId
    ) {
      entry.viewerHasPendingAction = true;
    }
  }

  const instances = await prisma.projectOrgWorkflowInstance.findMany({
    where: {
      projectId: opts.projectId,
      [field]: { in: ids },
    },
    orderBy: { createdAt: "desc" },
    select: {
      budgetId: true,
      procurementPlanId: true,
      requisitionId: true,
      actions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { decision: true, actorRoleName: true },
      },
    },
  });

  /** @type {Set<string>} */
  const seen = new Set();
  for (const inst of instances) {
    const entityId = inst[field];
    if (!entityId || seen.has(entityId) || !map.has(entityId)) continue;
    seen.add(entityId);
    const action = inst.actions?.[0];
    if (action) {
      map.get(entityId).lastDecision = {
        decision: action.decision,
        actorRoleName: action.actorRoleName || null,
      };
    }
  }

  return map;
}
