export const WORKFLOW_HISTORY_ACTION_SELECT = {
  id: true,
  decision: true,
  comment: true,
  actorRoleName: true,
  previousStatus: true,
  newStatus: true,
  createdAt: true,
  actor: { select: { firstName: true, lastName: true } },
};

/**
 * @param {any[] | null | undefined} actions
 */
export function mapWorkflowHistoryActions(actions) {
  return (actions || []).map(({ actor, ...a }) => ({
    ...a,
    actorName: actor ? `${actor.firstName || ""} ${actor.lastName || ""}`.trim() || null : null,
  }));
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
