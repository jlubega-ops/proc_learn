import { prisma } from "@/lib/prisma";
import {
  grantedRoles,
  pickHighestGrantedRole,
  sanitizeActiveRole,
  switchableRoles,
} from "@/lib/roles";
import { formatUserDisplayName } from "@/lib/user-display";

/**
 * Build client session payload from DB (single source for active role + theme).
 * @param {string} userId
 */
export async function buildSessionPayloadForUserId(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { settings: true, userRoles: true },
  });

  if (!user) {
    return { authenticated: false };
  }

  const displayName = formatUserDisplayName(user);
  const imageUrl = user.profilePhotoUrl?.trim() || "";

  if (!user.settings) {
    const g = grantedRoles(user.userRoles);
    const active = pickHighestGrantedRole(g);
    await prisma.userSettings.create({
      data: {
        userId: user.id,
        theme: "light",
        activeRole: active,
      },
    });
    return {
      authenticated: true,
      userId: user.id,
      email: user.email,
      displayName,
      imageUrl,
      theme: "light",
      grantedRoles: g,
      switchableRoles: switchableRoles(g),
      activeRole: active,
    };
  }

  const g = grantedRoles(user.userRoles);
  const storedActive = String(user.settings.activeRole);
  const active = sanitizeActiveRole(g, storedActive);

  if (active !== storedActive) {
    await prisma.userSettings.update({
      where: { userId: user.id },
      data: { activeRole: active },
    });
  }

  const theme = user.settings.theme === "dark" ? "dark" : "light";

  return {
    authenticated: true,
    userId: user.id,
    email: user.email,
    displayName,
    imageUrl,
    theme,
    grantedRoles: g,
    switchableRoles: switchableRoles(g),
    activeRole: active,
  };
}
