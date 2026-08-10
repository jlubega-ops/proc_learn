import { prisma } from "@/lib/prisma";
import { formatOrgUsername } from "@/lib/projects/org-user-identity";
import { orgUserPermissions } from "@/lib/projects/org-role-permissions";
import { formatUserDisplayName } from "@/lib/user-display";

/**
 * @param {string} orgUserId
 */
export async function buildSessionPayloadForOrgUserId(orgUserId) {
  const orgUser = await prisma.projectOrgUser.findUnique({
    where: { id: orgUserId },
    include: {
      projectOrgRole: { select: { id: true, name: true, isActive: true } },
      activeCommittee: {
        select: { id: true, name: true, committeeType: true, isActive: true },
      },
      project: {
        select: {
          id: true,
          name: true,
          organizationName: true,
          projectCode: true,
          isPublished: true,
        },
      },
    },
  });

  if (
    !orgUser ||
    orgUser.isProjectAdmin ||
    !orgUser.project ||
    !orgUser.project.isPublished ||
    !orgUser.projectOrgRole?.isActive
  ) {
    return { authenticated: false };
  }

  const username = formatOrgUsername(orgUser.email, orgUser.project.projectCode);
  const displayName = formatUserDisplayName(orgUser);
  const theme = orgUser.theme === "dark" ? "dark" : "light";
  const permissions = orgUserPermissions(orgUser.projectOrgRole.name);

  const activeCommittee =
    orgUser.activeCommittee && orgUser.activeCommittee.isActive !== false
      ? {
          id: orgUser.activeCommittee.id,
          name: orgUser.activeCommittee.name,
          committeeType: orgUser.activeCommittee.committeeType,
        }
      : null;

  return {
    authenticated: true,
    sessionType: "org",
    orgUserId: orgUser.id,
    projectId: orgUser.projectId,
    email: username,
    displayName,
    imageUrl: "",
    theme,
    orgRoleName: orgUser.projectOrgRole.name,
    permissions,
    projectName: orgUser.project.organizationName || orgUser.project.name,
    activeCommitteeId: activeCommittee?.id || null,
    activeCommittee,
    redirectTo: `/projects/${orgUser.projectId}`,
  };
}
