import { Role } from "@prisma/client";

/**
 * @param {import("@prisma/client").Role} activeRole
 */
export function actsAsExaminerRole(activeRole) {
  return activeRole === Role.EXAMINER || activeRole === Role.SYSTEM_ADMIN;
}

/** Read-only teaching surfaces (projects, participation, results): examiner or system admin. */
export const canViewTeaching = actsAsExaminerRole;

/**
 * Teaching actions (create/edit/publish projects, grade, release results): examiner only.
 * System admin views teaching data read-only.
 * @param {import("@prisma/client").Role} activeRole
 */
export function canTeach(activeRole) {
  return activeRole === Role.EXAMINER;
}

/**
 * View an examiner project's teaching data (participants, submissions, results).
 * @param {{ activeRole: import("@prisma/client").Role; project: any }} p
 */
export function canViewExaminerProject({ activeRole, project }) {
  if (!project || project.creatorRole !== Role.EXAMINER) return false;
  return canViewTeaching(activeRole);
}

/**
 * Create, edit, grade or delete examiner projects (examiner only).
 * @param {{ activeRole: import("@prisma/client").Role; project: any; userId?: string }} p
 */
export function canManageExaminerProject({ activeRole, project }) {
  if (!project || project.creatorRole !== Role.EXAMINER) return false;
  return canTeach(activeRole);
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
 * Examiner may configure settings on public student-owned projects
 * (never personal or attempt organisations).
 * @param {{ activeRole: import("@prisma/client").Role; project: any }} p
 */
export function canManageStudentProjectSettings({ activeRole, project }) {
  if (!project || project.creatorRole !== Role.STUDENT) return false;
  if (project.isPersonalOrg || project.isAttemptOrg) return false;
  return activeRole === Role.EXAMINER && project.visibility === "PUBLIC";
}

/** Personal and attempt organisations are system-managed: no owner edit, delete or settings. */
export function isSystemManagedOrg(project) {
  return Boolean(project?.isPersonalOrg || project?.isAttemptOrg);
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
