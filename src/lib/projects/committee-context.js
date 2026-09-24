import { writeAuditLog, AuditEvent } from "@/lib/audit-log";

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
 * Learner hint for where to work when this committee has few/no My Tasks rows.
 * @param {unknown} committeeType
 */
export function committeeModeWorkspaceHint(committeeType) {
  const type = String(committeeType || "").trim().toUpperCase();
  if (type === "CONTRACTS") {
    return {
      message:
        "Only Contracts Committee method-approval tasks are listed. Open a task to approve or return the recommended procurement method.",
      focusLabel: "My Tasks",
      focusPathSuffix: "/tasks",
    };
  }
  if (type === "EVALUATION") {
    return {
      message:
        "Evaluation work is done on the procurement record (evaluation report). My Tasks only lists committee-role steps when the process assigns them.",
      focusLabel: "Procurements",
      focusPathSuffix: "/procurements",
    };
  }
  if (type === "INSPECTION_ACCEPTANCE") {
    return {
      message:
        "Inspection / acceptance is recorded on the procurement delivery steps. Switch back to your organisation role for other approvals.",
      focusLabel: "Procurements",
      focusPathSuffix: "/procurements",
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

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} orgUserId
 */
export async function getActiveCommittee(prisma, orgUserId) {
  const user = await prisma.projectOrgUser.findUnique({
    where: { id: orgUserId },
    select: {
      activeCommitteeId: true,
      activeCommittee: { select: { id: true, name: true, committeeType: true } },
    },
  });
  return user?.activeCommittee || null;
}

/**
 * List committees an org user is an ACTIVE member of (candidates for activation).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; orgUserId: string }} opts
 */
export async function listMyCommittees(prisma, opts) {
  const memberships = await prisma.projectOrgCommitteeMember.findMany({
    where: { orgUserId: opts.orgUserId, status: "ACTIVE", committee: { projectId: opts.projectId } },
    include: { committee: { select: { id: true, name: true, committeeType: true, isActive: true } } },
  });
  return memberships
    .filter((m) => m.committee?.isActive)
    .map((m) => ({
      id: m.committee.id,
      name: m.committee.name,
      committeeType: m.committee.committeeType,
      committeeRole: m.committeeRole,
    }));
}

/**
 * Set (or clear) the active committee context for the acting org user.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   orgUserId: string;
 *   committeeId: string | null;
 * }} opts
 */
export async function setActiveCommittee(prisma, opts) {
  if (!opts.committeeId) {
    await prisma.projectOrgUser.update({
      where: { id: opts.orgUserId },
      data: { activeCommitteeId: null },
    });
    return { ok: true, activeCommittee: null };
  }

  const membership = await prisma.projectOrgCommitteeMember.findFirst({
    where: {
      orgUserId: opts.orgUserId,
      status: "ACTIVE",
      committee: { id: opts.committeeId, projectId: opts.projectId, isActive: true },
    },
    include: { committee: { select: { id: true, name: true, committeeType: true } } },
  });
  if (!membership) {
    return {
      ok: false,
      error: "You are not an active member of that committee.",
      status: 403,
    };
  }

  await prisma.projectOrgUser.update({
    where: { id: opts.orgUserId },
    data: { activeCommitteeId: membership.committee.id },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_USER_UPDATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      orgUserId: opts.orgUserId,
      activeCommitteeId: membership.committee.id,
      kind: "active_committee_context",
    },
  });

  return {
    ok: true,
    activeCommittee: {
      id: membership.committee.id,
      name: membership.committee.name,
      committeeType: membership.committee.committeeType,
      committeeRole: membership.committeeRole,
    },
  };
}

/**
 * Resolve the effective committee context for an action: explicit opts win,
 * otherwise fall back to the org user's stored active committee.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ orgUserId: string; activeCommitteeId?: string | null; committeeRole?: string | null }} opts
 */
export async function resolveCommitteeContext(prisma, opts) {
  if (opts.activeCommitteeId) {
    return { committeeId: opts.activeCommitteeId, committeeRole: opts.committeeRole || null };
  }
  const active = await getActiveCommittee(prisma, opts.orgUserId);
  return { committeeId: active?.id || null, committeeRole: opts.committeeRole || null };
}

/**
 * Require that the actor is an ACTIVE member of the given committee (or of *a*
 * committee of the required type when committeeId is not specified).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   orgUserId: string;
 *   committeeId?: string | null;
 *   committeeType: import("@prisma/client").OrgCommitteeType;
 * }} opts
 */
export async function requireCommitteeMembership(prisma, opts) {
  const where = {
    orgUserId: opts.orgUserId,
    status: "ACTIVE",
    committee: {
      projectId: opts.projectId,
      isActive: true,
      committeeType: opts.committeeType,
      ...(opts.committeeId ? { id: opts.committeeId } : {}),
    },
  };
  const membership = await prisma.projectOrgCommitteeMember.findFirst({
    where,
    include: { committee: { select: { id: true, name: true, committeeType: true } } },
  });
  if (!membership) {
    const typeLabel = String(opts.committeeType || "").replace(/_/g, " ").toLowerCase();
    return {
      ok: false,
      error: `You must be an active member of a ${typeLabel} committee to do this.`,
      status: 403,
    };
  }
  return {
    ok: true,
    committee: membership.committee,
    committeeRole: membership.committeeRole,
  };
}
