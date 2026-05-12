import { Role } from "@prisma/client";

/**
 * @param {{ userId: string; activeRole: import("@prisma/client").Role; project: any }} p
 */
export function canViewProjectByRole({ userId, activeRole, project }) {
  if (!project) return false;

  if (
    activeRole === Role.STUDENT &&
    project.ownerUserId === userId &&
    project.creatorRole === Role.STUDENT
  ) {
    return true;
  }
  if (
    activeRole === Role.LECTURER &&
    project.ownerUserId === userId &&
    project.creatorRole === Role.LECTURER
  ) {
    return true;
  }
  if (
    activeRole === Role.LECTURER &&
    project.creatorRole === Role.EXAMINER &&
    project.purpose === "PRACTICE"
  ) {
    return true;
  }
  if (
    activeRole === Role.EXAMINER &&
    project.ownerUserId === userId &&
    project.creatorRole === Role.EXAMINER
  ) {
    return true;
  }
  if (
    [Role.LECTURER, Role.EXAMINER].includes(activeRole) &&
    project.creatorRole === Role.STUDENT &&
    project.visibility === "PUBLIC"
  ) {
    return true;
  }
  if (
    activeRole === Role.STUDENT &&
    project.visibility === "PUBLIC" &&
    project.isPublished &&
    [Role.LECTURER, Role.EXAMINER].includes(project.creatorRole) &&
    (!project.closeAt || new Date(project.closeAt).getTime() >= Date.now())
  ) {
    return true;
  }
  return false;
}

