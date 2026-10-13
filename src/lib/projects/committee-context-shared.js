import {
  COMMITTEE_LIFECYCLE_AUTHORITY,
  LIFECYCLE_ACTION_ROLES,
} from "@/lib/projects/procurement-lifecycle-roles";

/**
 * "Active committee" is the committee context an organisation user is currently
 * acting under (evaluation / post-qualification / inspection reports need to know
 * which hat the actor is wearing when multiple committee memberships exist).
 * Stored on ProjectOrgUser.activeCommitteeId (nullable — most users belong to zero
 * or one active committee, so this is optional context, never a hard requirement).
 *
 * Committee seats are hats on existing ProjectOrgUser rows — do not create separate
 * logins just to sit on a committee.
 */

/**
 * Workflow `requiredRoleName` values that are committee hats (not org logins).
 * @type {Record<string, string[]>}
 */
export const COMMITTEE_TYPE_WORKFLOW_ROLES = {
  CONTRACTS: ["Contracts Committee"],
  EVALUATION: ["Evaluation Committee"],
  NEGOTIATION: ["Negotiation Committee"],
  INSPECTION_ACCEPTANCE: ["Inspection/Acceptance Committee", "Inspection Committee"],
};

/**
 * @param {unknown} roleName
 */
export function isCommitteeWorkflowRole(roleName) {
  const name = String(roleName || "").trim();
  if (!name) return false;
  return Object.values(COMMITTEE_TYPE_WORKFLOW_ROLES).some((roles) => roles.includes(name));
}

/**
 * @param {unknown} committeeType
 * @returns {string[]}
 */
export function workflowRolesForCommitteeType(committeeType) {
  const key = String(committeeType || "").trim().toUpperCase();
  return COMMITTEE_TYPE_WORKFLOW_ROLES[key] || [];
}

/**
 * Whether a pending task belongs to the active committee seat.
 * Strict: only tasks assigned to that committee workflow role (or Contracts method title).
 * Evaluation / inspection work lives on procurement detail screens, not mixed into org tasks.
 * @param {{ requiredRoleName?: string | null; title?: string | null }} task
 * @param {{ committeeType?: string | null } | null | undefined} activeCommittee
 */
export function taskMatchesActiveCommittee(task, activeCommittee) {
  const type = String(activeCommittee?.committeeType || "").trim().toUpperCase();
  if (!type) return false;

  const role = String(task?.requiredRoleName || "").trim();
  const roles = workflowRolesForCommitteeType(type);
  if (roles.includes(role)) return true;

  if (type === "CONTRACTS") {
    const title = String(task?.title || "");
    return /approve procurement method/i.test(title) || /contracts committee/i.test(title);
  }

  return false;
}

/**
 * Committee type of a workflow role name ("Contracts Committee" → "CONTRACTS"), or null for org roles.
 * @param {unknown} roleName
 */
export function committeeTypeForWorkflowRole(roleName) {
  const name = String(roleName || "").trim();
  for (const [type, roles] of Object.entries(COMMITTEE_TYPE_WORKFLOW_ROLES)) {
    if (roles.includes(name)) return type;
  }
  return null;
}

/** Read-only lifecycle actions allowed in any acting mode. */
const READ_ONLY_LIFECYCLE_ACTIONS = new Set(["evaluate_closure", "evaluation_context"]);

/**
 * @param {string} type
 */
function committeeLabel(type) {
  const roles = COMMITTEE_TYPE_WORKFLOW_ROLES[type];
  return roles?.[0] || `${type.replace(/_/g, " ").toLowerCase()} committee`;
}

/**
 * Exclusive acting mode for workflow tasks: committee tasks need that committee seat active;
 * organisation-role tasks need committee mode switched off.
 * @param {{ requiredRoleName?: string | null; title?: string | null }} task
 * @param {{ committeeType?: string | null; name?: string | null } | null | undefined} activeCommittee
 * @returns {{ ok: true } | { ok: false; error: string; status: number; code: string }}
 */
export function checkActingModeForTask(task, activeCommittee) {
  const requiredType = committeeTypeForWorkflowRole(task?.requiredRoleName);
  const activeType = String(activeCommittee?.committeeType || "").toUpperCase() || null;
  if (requiredType) {
    if (activeType !== requiredType) {
      return {
        ok: false,
        error: `This is ${committeeLabel(requiredType)} work. Switch to the ${committeeLabel(requiredType)} from the account menu before acting on it.`,
        status: 403,
        code: "COMMITTEE_MODE_REQUIRED",
      };
    }
    return { ok: true };
  }
  if (activeType) {
    return {
      ok: false,
      error: `You are acting as ${activeCommittee?.name || committeeLabel(activeType)}. Click “Switch back to organisation role” in the banner to do ${task?.requiredRoleName || "organisation-role"} work.`,
      status: 403,
      code: "ORG_ROLE_MODE_REQUIRED",
    };
  }
  return { ok: true };
}

/**
 * Same exclusive acting-mode rule for procurement lifecycle actions.
 * @param {string} action
 * @param {{ committeeType?: string | null; name?: string | null } | null | undefined} activeCommittee
 * @returns {{ ok: true } | { ok: false; error: string; status: number; code: string }}
 */
export function checkActingModeForLifecycleAction(action, activeCommittee) {
  if (READ_ONLY_LIFECYCLE_ACTIONS.has(action)) return { ok: true };
  const activeType = String(activeCommittee?.committeeType || "").toUpperCase() || null;
  const committeeTypes = Object.entries(COMMITTEE_LIFECYCLE_AUTHORITY)
    .filter(([, actions]) => actions.includes(action))
    .map(([type]) => type);
  const orgRoles = LIFECYCLE_ACTION_ROLES[action];
  const orgRoleMayAct = Array.isArray(orgRoles) && orgRoles.length > 0;

  if (activeType) {
    if (committeeTypes.includes(activeType)) return { ok: true };
    return checkActingModeForTask({ requiredRoleName: "organisation-role" }, activeCommittee);
  }
  if (!orgRoleMayAct && committeeTypes.length > 0) {
    return checkActingModeForTask({ requiredRoleName: committeeLabel(committeeTypes[0]) }, null);
  }
  return { ok: true };
}

/**
 * Learner hint for where to work when this committee has few/no My Tasks rows.
 * @param {unknown} committeeType
 */
export function committeeModeWorkspaceHint(committeeType) {
  const type = String(committeeType || "").trim().toUpperCase();
  if (type === "CONTRACTS") {
    return {
      message:
        "Contracts Committee decisions are listed here: procurement method, solicitation documents, evaluation committee, evaluation report, post-qualification and award. Open a task to approve or return it.",
      focusLabel: "My Tasks",
      focusPathSuffix: "/tasks",
    };
  }
  if (type === "EVALUATION") {
    return {
      message:
        "Evaluation steps (technical, financial, report, post-qualification) are listed in My Tasks. Fill and submit the evaluation report on the procurement record before completing the report task.",
      focusLabel: "My Tasks",
      focusPathSuffix: "/tasks",
    };
  }
  if (type === "INSPECTION_ACCEPTANCE") {
    return {
      message:
        "Inspection / acceptance tasks are listed in My Tasks and recorded on the procurement delivery. Switch back to your organisation role for other approvals.",
      focusLabel: "My Tasks",
      focusPathSuffix: "/tasks",
    };
  }
  if (type === "NEGOTIATION") {
    return {
      message: "Negotiation committee actions are taken on the related procurement record.",
      focusLabel: "Procurements",
      focusPathSuffix: "/procurements",
    };
  }
  return {
    message: "Only this committee’s work is shown while the seat is active.",
    focusLabel: "My Tasks",
    focusPathSuffix: "/tasks",
  };
}

/**
 * Split assignee tasks into org-role work vs committee work for learner-friendly modes.
 * @param {any[]} tasks
 * @param {{ committeeType?: string | null } | null | undefined} activeCommittee
 */
export function partitionTasksForActingMode(tasks, activeCommittee) {
  const list = Array.isArray(tasks) ? tasks : [];
  const committeeTasks = list.filter((t) => isCommitteeWorkflowRole(t.requiredRoleName));
  const orgTasks = list.filter((t) => !isCommitteeWorkflowRole(t.requiredRoleName));

  if (activeCommittee?.committeeType) {
    const visible = list.filter((t) => taskMatchesActiveCommittee(t, activeCommittee));
    return {
      mode: /** @type {"committee"} */ ("committee"),
      visible,
      hiddenCount: Math.max(0, list.length - visible.length),
      otherCommitteeCount: committeeTasks.filter((t) => !taskMatchesActiveCommittee(t, activeCommittee))
        .length,
      orgTaskCount: orgTasks.length,
    };
  }

  return {
    mode: /** @type {"org"} */ ("org"),
    visible: orgTasks,
    hiddenCount: committeeTasks.length,
    otherCommitteeCount: 0,
    orgTaskCount: orgTasks.length,
  };
}

/**
 * @param {unknown} role
 */
export function formatCommitteeSeatLabel(role) {
  const raw = String(role || "").trim();
  if (!raw) return "Member";
  return raw
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
