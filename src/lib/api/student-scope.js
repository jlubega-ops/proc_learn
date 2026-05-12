import { Role } from "@prisma/client";

/**
 * @param {string | null | undefined} activeRole
 */
export function canManageStudents(activeRole) {
  return activeRole === Role.SYSTEM_ADMIN || activeRole === Role.EXAMINER;
}

/**
 * @param {string | null | undefined} activeRole
 */
export function canManageProgrammes(activeRole) {
  return activeRole === Role.SYSTEM_ADMIN;
}

/**
 * @param {string | null | undefined} activeRole
 */
export function canManageStaffUsers(activeRole) {
  return activeRole === Role.SYSTEM_ADMIN;
}
