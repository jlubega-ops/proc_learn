import { Role } from "@prisma/client";
import {
  canAccessProjectWorkspace,
  canManageProjectOrgWorkspace,
} from "@/lib/projects/access";

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
