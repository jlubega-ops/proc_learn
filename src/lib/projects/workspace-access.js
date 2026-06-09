import { Role } from "@prisma/client";
import {
  canAccessProjectWorkspace,
  canManageProjectOrgWorkspace,
} from "@/lib/projects/access";
import { orgUserHasPermission } from "@/lib/projects/org-role-permissions";

/** Minimal project fields required for workspace authorization checks. */
export const projectWorkspaceAuthSelect = {
  id: true,
  ownerUserId: true,
  creatorRole: true,
  purpose: true,
  visibility: true,
  isPublished: true,
  closeAt: true,
  requiresEnrollment: true,
};

/**
 * Loads a project only when the user is allowed to access its workspace (not via shared URL alone).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; userId: string; activeRole: import("@prisma/client").Role; select?: Record<string, unknown> }} p
 */
export async function fetchAuthorizedProjectWorkspace(prisma, {
  projectId,
  userId,
  activeRole,
  select = projectWorkspaceAuthSelect,
}) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select,
  });
  if (!project) return null;

  const enrollment =
    activeRole === Role.STUDENT
      ? await prisma.projectEnrollment.findUnique({
          where: {
            projectId_studentUserId: { projectId, studentUserId: userId },
          },
          select: { id: true, status: true },
        })
      : null;

  if (!canAccessProjectWorkspace({ userId, activeRole, project, enrollment })) {
    return null;
  }

  return {
    project,
    enrollment,
    canManageOrgAdmin: canManageProjectOrgWorkspace({ userId, activeRole, project }),
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; userId: string; activeRole: import("@prisma/client").Role }} p
 */
export async function authorizeProjectOrgAdmin(prisma, { projectId, userId, activeRole }) {
  const access = await fetchAuthorizedProjectWorkspace(prisma, { projectId, userId, activeRole });
  if (!access) return { ok: false, status: 404 };
  if (!access.canManageOrgAdmin) return { ok: false, status: 403 };
  return { ok: true, project: access.project };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; orgUserId: string; requiredPermission?: string }} p
 */
export async function authorizeProjectOrgMember(prisma, { projectId, orgUserId, requiredPermission }) {
  const orgUser = await prisma.projectOrgUser.findFirst({
    where: {
      id: orgUserId,
      projectId,
      isProjectAdmin: false,
      linkedUserId: null,
    },
    include: {
      projectOrgRole: { select: { id: true, name: true, isActive: true } },
      project: { select: projectWorkspaceAuthSelect },
    },
  });

  if (!orgUser?.project) return { ok: false, status: 404 };
  if (!orgUser.project.isPublished) return { ok: false, status: 403 };
  if (!orgUser.projectOrgRole?.isActive) return { ok: false, status: 403 };

  if (
    requiredPermission &&
    !orgUserHasPermission(orgUser.projectOrgRole.name, requiredPermission)
  ) {
    return { ok: false, status: 403 };
  }

  return { ok: true, orgUser, project: orgUser.project };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} orgUserId
 */
export async function fetchAuthorizedOrgUserWorkspace(prisma, orgUserId) {
  const orgUser = await prisma.projectOrgUser.findUnique({
    where: { id: orgUserId },
    include: {
      projectOrgRole: { select: { id: true, name: true, isActive: true } },
      project: { select: projectWorkspaceAuthSelect },
      department: { select: { id: true, name: true } },
      subunit: { select: { id: true, name: true } },
    },
  });

  if (
    !orgUser ||
    orgUser.isProjectAdmin ||
    !orgUser.project ||
    !orgUser.project.isPublished ||
    !orgUser.projectOrgRole?.isActive
  ) {
    return null;
  }

  return { orgUser, project: orgUser.project };
}
