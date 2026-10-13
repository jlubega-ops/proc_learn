import { UserAccountStatus } from "@prisma/client";
import { getReadableAppSession } from "@/lib/auth/session";
import { isSessionVersionCurrent } from "@/lib/auth/session-version";
import { prisma } from "@/lib/prisma";
import { grantedRoles, pickHighestGrantedRole, sanitizeActiveRole } from "@/lib/roles";

/**
 * @typedef {import("@prisma/client").User & {
 *   settings: import("@prisma/client").UserSettings | null;
 *   userRoles: import("@prisma/client").UserRole[];
 * }} SessionUser
 */

/**
 * Loads the signed-in user with settings and roles. Returns null if not signed in, missing,
 * suspended, or signed in again elsewhere (stale session version).
 * @returns {Promise<SessionUser | null>}
 */
export async function getSessionUser() {
  const session = await getReadableAppSession();
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      settings: true,
      userRoles: true,
      studentProfile: { select: { studentNumber: true } },
    },
  });
  if (!user) return null;
  if (user.accountStatus === UserAccountStatus.SUSPENDED) return null;
  if (!isSessionVersionCurrent(session, user)) return null;

  const g = grantedRoles(user.userRoles);
  if (!user.settings) {
    user.settings = await prisma.userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, theme: "light", activeRole: pickHighestGrantedRole(g) },
      update: {},
    });
  }

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
