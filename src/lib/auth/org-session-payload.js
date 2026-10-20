import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { orgUserPermissions } from "@/lib/projects/org-role-permissions";
import { formatUserDisplayName } from "@/lib/user-display";
import { formatCommitteeSeatLabel } from "@/lib/projects/committee-context";

/**
 * @param {string} orgUserId
 */
export const buildSessionPayloadForOrgUserId = cache(async function buildSessionPayloadForOrgUserId(
  orgUserId,
) {
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

  const username = orgUser.email;
  const displayName = formatUserDisplayName(orgUser);
  const theme = orgUser.theme === "dark" ? "dark" : "light";
  const permissions = orgUserPermissions(orgUser.projectOrgRole.name);

  let activeCommittee = null;
  if (orgUser.activeCommittee && orgUser.activeCommittee.isActive !== false) {
    const seat = await prisma.projectOrgCommitteeMember.findFirst({
      where: {
        orgUserId: orgUser.id,
        committeeId: orgUser.activeCommittee.id,
        status: "ACTIVE",
      },
      select: { committeeRole: true },
    });
    activeCommittee = {
      id: orgUser.activeCommittee.id,
      name: orgUser.activeCommittee.name,
      committeeType: orgUser.activeCommittee.committeeType,
      committeeRole: seat?.committeeRole || null,
      committeeRoleLabel: formatCommitteeSeatLabel(seat?.committeeRole),
    };
  }

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
});
