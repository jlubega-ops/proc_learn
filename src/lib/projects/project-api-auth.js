import { Role } from "@prisma/client";
import { mutateActiveAppSession } from "@/lib/auth/session";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import {
  authorizeProjectOrgAdmin,
  authorizeProjectOrgMember,
  fetchAuthorizedProjectWorkspace,
} from "@/lib/projects/workspace-access";

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   requireOrgAdmin?: boolean;
 *   orgPermission?: string;
 * }} p
 */
export async function authorizeProjectApiAccess(prisma, {
  projectId,
  requireOrgAdmin = false,
  orgPermission,
}) {
  const session = await mutateActiveAppSession();
  if (!session) return { ok: false, status: 401 };

  if (session.orgUserId) {
    if (requireOrgAdmin) return { ok: false, status: 403 };
    const auth = await authorizeProjectOrgMember(prisma, {
      projectId,
      orgUserId: session.orgUserId,
      requiredPermission: orgPermission,
    });
    if (!auth.ok) return { ok: false, status: auth.status };
    return { ok: true, type: "org", orgUser: auth.orgUser, project: auth.project };
  }

  const user = await getSessionUser();
  if (!user) return { ok: false, status: 401 };
  const activeRole = sessionActiveRole(user) || Role.STUDENT;

  if (requireOrgAdmin) {
    const auth = await authorizeProjectOrgAdmin(prisma, { projectId, userId: user.id, activeRole });
    if (!auth.ok) return { ok: false, status: auth.status };
    return { ok: true, type: "platform", user, activeRole, project: auth.project };
  }

  const access = await fetchAuthorizedProjectWorkspace(prisma, {
    projectId,
    userId: user.id,
    activeRole,
  });
  if (!access) return { ok: false, status: 404 };
  return {
    ok: true,
    type: "platform",
    user,
    activeRole,
    project: access.project,
    canManageOrgAdmin: access.canManageOrgAdmin,
  };
}

/**
 * Org members with a view permission, or platform project owners (org admin).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; orgPermission: string }} p
 */
export async function authorizeProjectOrgRead(prisma, { projectId, orgPermission }) {
  const session = await mutateActiveAppSession();
  if (!session) return { ok: false, status: 401 };

  if (session.orgUserId) {
    const auth = await authorizeProjectOrgMember(prisma, {
      projectId,
      orgUserId: session.orgUserId,
      requiredPermission: orgPermission,
    });
    if (!auth.ok) return { ok: false, status: auth.status };
    return { ok: true, type: "org", orgUser: auth.orgUser, project: auth.project, readOnly: true };
  }

  const user = await getSessionUser();
  if (!user) return { ok: false, status: 401 };
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const auth = await authorizeProjectOrgAdmin(prisma, { projectId, userId: user.id, activeRole });
  if (!auth.ok) return { ok: false, status: auth.status };
  return {
    ok: true,
    type: "platform",
    user,
    activeRole,
    project: auth.project,
    readOnly: false,
  };
}
