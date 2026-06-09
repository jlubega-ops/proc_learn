import { redirect, notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionOrgUser } from "@/lib/api/get-session-org-user";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { orgPermissionForPathname, orgUserHasPermission } from "@/lib/projects/org-role-permissions";
import { prisma } from "@/lib/prisma";
import { fetchAuthorizedProjectWorkspace } from "@/lib/projects/workspace-access";

/**
 * @param {string} projectId
 * @param {{ pathname?: string; requirePlatformOrgAdmin?: boolean }} [opts]
 */
export async function getProjectWorkspacePageContext(projectId, opts = {}) {
  const orgUser = await getSessionOrgUser();
  if (orgUser) {
    if (orgUser.projectId !== projectId) {
      redirect(`/projects/${orgUser.projectId}`);
    }
    if (opts.pathname) {
      const perm = orgPermissionForPathname(opts.pathname);
      if (perm && !orgUserHasPermission(orgUser.projectOrgRole?.name, perm)) {
        redirect(`/projects/${projectId}`);
      }
      if (opts.pathname.includes("/org-admin/users")) {
        redirect(`/projects/${projectId}`);
      }
    }
    return {
      viewer: "org",
      orgUser,
      readOnly: true,
      projectId,
      project: orgUser.project,
    };
  }

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/projects/${projectId}`);
  const activeRole = sessionActiveRole(user) || Role.STUDENT;

  const access = await fetchAuthorizedProjectWorkspace(prisma, {
    projectId,
    userId: user.id,
    activeRole,
  });
  if (!access) notFound();

  if (opts.requirePlatformOrgAdmin && !access.canManageOrgAdmin) {
    redirect(`/projects/${projectId}`);
  }

  return {
    viewer: "platform",
    user,
    activeRole,
    readOnly: false,
    projectId,
    canManageOrgAdmin: access.canManageOrgAdmin,
    project: access.project,
  };
}
