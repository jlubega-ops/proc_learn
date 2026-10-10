export const WORKFLOW_HISTORY_ACTION_SELECT = {
  id: true,
  decision: true,
  comment: true,
  actorRoleName: true,
  previousStatus: true,
  newStatus: true,
  createdAt: true,
  committeeId: true,
  committeeRole: true,
  actor: { select: { firstName: true, lastName: true } },
  task: { select: { requiredRoleName: true, title: true } },
};

/**
 * @param {any[] | null | undefined} actions
 */
export function mapWorkflowHistoryActions(actions) {
  return (actions || []).map(({ actor, task, ...a }) => ({
    ...a,
    actorName: actor ? `${actor.firstName || ""} ${actor.lastName || ""}`.trim() || null : null,
    stepRoleName: task?.requiredRoleName || null,
    taskTitle: task?.title || null,
  }));
}

/**
 * Adds `committeeName` to history / timeline entries decided from a committee seat.
 * @template {{ committeeId?: string | null }} T
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {T[]} entries
 * @returns {Promise<(T & { committeeName?: string | null })[]>}
 */
export async function attachCommitteeNames(prisma, entries) {
  const ids = [...new Set((entries || []).map((e) => e.committeeId).filter(Boolean))];
  if (!ids.length) return entries || [];
  const rows = await prisma.projectOrgCommittee.findMany({
    where: { id: { in: /** @type {string[]} */ (ids) } },
    select: { id: true, name: true },
  });
  const names = new Map(rows.map((r) => [r.id, r.name]));
  return entries.map((e) => (e.committeeId ? { ...e, committeeName: names.get(e.committeeId) || null } : e));
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 */
export async function loadPrintOrganisation(prisma, projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, organizationName: true, projectCode: true },
  });
  return {
    name: project?.organizationName || project?.name || "",
    code: project?.projectCode || null,
  };
}

/**
 * @param {any} auth
 */
export function printedByFromAuth(auth) {
  if (auth?.type === "org") {
    return {
      name: `${auth.orgUser.firstName || ""} ${auth.orgUser.lastName || ""}`.trim(),
      role: auth.orgUser.projectOrgRole?.name || null,
    };
  }
  return {
    name:
      [auth?.user?.firstName, auth?.user?.lastName].filter(Boolean).join(" ") ||
      auth?.user?.email ||
      "",
    role: "Organisation Administrator",
  };
}
