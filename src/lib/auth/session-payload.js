import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  grantedRoles,
  pickHighestGrantedRole,
  sanitizeActiveRole,
  switchableRoles,
} from "@/lib/roles";
import { formatUserDisplayName } from "@/lib/user-display";
import { DEFAULT_POST_AUTH_PATH } from "@/lib/appConfig";
import { ensureStudentPersonalOrg } from "@/lib/projects/student-personal-org";
import { ensureCoreProjectOrgRoles } from "@/lib/project-org-role";
import { ensureBaselineProcessTemplates } from "@/lib/projects/process-catalogue";

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
  const g = grantedRoles(user.userRoles);

  let active;
  let theme = "light";

  if (!user.settings) {
    active = pickHighestGrantedRole(g);
    await prisma.userSettings.create({
      data: {
        userId: user.id,
        theme: "light",
        activeRole: active,
      },
    });
  } else {
    const storedActive = String(user.settings.activeRole);
    active = sanitizeActiveRole(g, storedActive);
    if (active !== storedActive) {
      await prisma.userSettings.update({
        where: { userId: user.id },
        data: { activeRole: active },
      });
    }
    theme = user.settings.theme === "dark" ? "dark" : "light";
  }

  /** @type {string | null} */
  let personalOrgProjectId = null;
  /** @type {string | null} */
  let personalOrgName = null;
  /** @type {string | null} */
  let personalOrgCode = null;
  let defaultPath = DEFAULT_POST_AUTH_PATH;

  if (active === Role.STUDENT) {
    try {
      await ensureCoreProjectOrgRoles(prisma);
      await ensureBaselineProcessTemplates(prisma);
      const org = await ensureStudentPersonalOrg(prisma, user.id);
      if (org?.id) {
        personalOrgProjectId = org.id;
        personalOrgName = org.organizationName || org.name || null;
        personalOrgCode = org.projectCode || null;
        defaultPath = `/organisation`;
      }
    } catch {
      /* keep default path if provisioning fails */
    }
  }

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
    mustChangePassword: Boolean(user.mustChangePassword),
    personalOrgProjectId,
    personalOrgName,
    personalOrgCode,
    defaultPath,
  };
}
