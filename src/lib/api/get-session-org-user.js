import { getReadableAppSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { projectWorkspaceAuthSelect } from "@/lib/projects/workspace-access";

const orgUserInclude = {
  projectOrgRole: { select: { id: true, name: true, isActive: true } },
  project: { select: { ...projectWorkspaceAuthSelect, name: true, organizationName: true, projectCode: true } },
  department: { select: { id: true, name: true } },
  subunit: { select: { id: true, name: true } },
};

/**
 * @typedef {import("@prisma/client").ProjectOrgUser & {
 *   projectOrgRole: { id: string; name: string; isActive: boolean };
 *   project: import("@prisma/client").Project;
 *   department: { id: string; name: string } | null;
 *   subunit: { id: string; name: string } | null;
 * }} SessionOrgUser
 */

/**
 * @returns {Promise<SessionOrgUser | null>}
 */
export async function getSessionOrgUser() {
  const session = await getReadableAppSession();
  if (!session?.orgUserId) return null;

  const orgUser = await prisma.projectOrgUser.findUnique({
    where: { id: session.orgUserId },
    include: orgUserInclude,
  });

  if (!orgUser || orgUser.isProjectAdmin || !orgUser.project) return null;
  if (!orgUser.project.isPublished) return null;
  if (!orgUser.projectOrgRole?.isActive) return null;

  return orgUser;
}
