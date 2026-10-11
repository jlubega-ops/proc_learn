import { Role } from "@prisma/client";

/**
 * @param {import("@prisma/client").Role} activeRole
 */
export function actsAsExaminerRole(activeRole) {
  return activeRole === Role.EXAMINER || activeRole === Role.SYSTEM_ADMIN;
}

/**
 * Create, edit, or delete examiner projects (system admin and any examiner).
 * @param {{ activeRole: import("@prisma/client").Role; project: any; userId?: string }} p
 */
export function canManageExaminerProject({ activeRole, project }) {
  if (!project || project.creatorRole !== Role.EXAMINER) return false;
  return actsAsExaminerRole(activeRole);
}

/**
 * @param {{ userId: string; activeRole: import("@prisma/client").Role; project: any }} p
 */
export function canViewProjectByRole({ userId, activeRole, project }) {
  if (!project) return false;
  if (activeRole === Role.SYSTEM_ADMIN) return true;

  if (
    activeRole === Role.STUDENT &&
    project.ownerUserId === userId &&
    project.creatorRole === Role.STUDENT
  ) {
    return true;
  }
  if (activeRole === Role.EXAMINER && project.creatorRole === Role.EXAMINER) {
    return true;
  }
  if (
    activeRole === Role.EXAMINER &&
    project.creatorRole === Role.STUDENT &&
    project.visibility === "PUBLIC"
  ) {
    return true;
  }
  if (
    activeRole === Role.STUDENT &&
    project.visibility === "PUBLIC" &&
    project.isPublished &&
    project.creatorRole === Role.EXAMINER &&
    (!project.closeAt || new Date(project.closeAt).getTime() >= Date.now())
  ) {
    return true;
  }
  return false;
}

/**
 * System admin or examiner may configure settings on student-owned projects.
 * @param {{ activeRole: import("@prisma/client").Role; project: any }} p
 */
export function canManageStudentProjectSettings({ activeRole, project }) {
  if (!project || project.creatorRole !== Role.STUDENT) return false;
  if (activeRole === Role.SYSTEM_ADMIN) return true;
  if (activeRole === Role.EXAMINER && project.visibility === "PUBLIC") return true;
  return false;
}

/**
 * Student project owner managing organisation admin (departments, users, financial years, etc.).
 * @param {{ userId: string; activeRole: import("@prisma/client").Role; project: any }} p
 */
export function canManageProjectOrgWorkspace({ userId, activeRole, project }) {
  return (
    activeRole === Role.STUDENT &&
    project?.creatorRole === Role.STUDENT &&
    project?.ownerUserId === userId
  );
}

/**
 * Whether the signed-in user may open this project workspace (pages, detail APIs, org data).
 * Stricter than catalog/list visibility — blocks URL sharing to users who are not allowed.
 * @param {{ userId: string; activeRole: import("@prisma/client").Role; project: any; enrollment?: { id: string } | null }} p
 */
export function canAccessProjectWorkspace({ userId, activeRole, project, enrollment = null }) {
  if (!canViewProjectByRole({ userId, activeRole, project })) return false;

  if (
    activeRole === Role.STUDENT &&
    project.creatorRole === Role.EXAMINER &&
    project.requiresEnrollment
  ) {
    return Boolean(enrollment);
  }

  return true;
}
