import { Role } from "@prisma/client";

/**
 * @param {import("@prisma/client").Role | string | null | undefined} activeRole
 */
export function canViewProjectProcessFlows(activeRole) {
  return activeRole === Role.SYSTEM_ADMIN || activeRole === Role.EXAMINER;
}

/**
 * @param {import("@prisma/client").Role | string | null | undefined} activeRole
 */
export function canManageProjectProcessFlows(activeRole) {
  return activeRole === Role.SYSTEM_ADMIN;
}
