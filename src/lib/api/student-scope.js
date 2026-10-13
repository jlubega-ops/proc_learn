import { Role } from "@prisma/client";

/**
 * Student accounts (create, edit, suspend, import, resend activation): active system admin only.
 * @param {string | null | undefined} activeRole
 */
export function canManageStudents(activeRole) {
  return activeRole === Role.SYSTEM_ADMIN;
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
