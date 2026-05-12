import { getAppSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { grantedRoles, sanitizeActiveRole } from "@/lib/roles";

/**
 * @typedef {import("@prisma/client").User & {
 *   settings: import("@prisma/client").UserSettings | null;
 *   userRoles: import("@prisma/client").UserRole[];
 * }} SessionUser
 */

/**
 * Loads the signed-in user with settings and roles. Returns null if not signed in or user missing.
 * @returns {Promise<SessionUser | null>}
 */
export async function getSessionUser() {
  const session = await getAppSession();
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { settings: true, userRoles: true },
  });
  if (!user?.settings) return user;

  const g = grantedRoles(user.userRoles);
  const stored = String(user.settings.activeRole ?? "").trim();
  const active = sanitizeActiveRole(g, stored);
  if (active !== stored) {
    await prisma.userSettings.update({
      where: { userId: user.id },
      data: { activeRole: active },
    });
    user.settings.activeRole = active;
  }
  return user;
}

/**
 * @param {SessionUser | null} user
 */
export function sessionUserGrantedRoles(user) {
  if (!user) return [];
  return grantedRoles(user.userRoles);
}

/**
 * @param {SessionUser | null} user
 */
export function sessionActiveRole(user) {
  return user?.settings?.activeRole ?? null;
}
