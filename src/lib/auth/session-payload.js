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
import { ensureCoreProjectOrgRoles } from "@/lib/project-org-role";
import { ensureBaselineProcessTemplates } from "@/lib/projects/process-catalogue";
import {
  findStudentPracticeJoinOffer,
  resolveStudentActiveOrganisation,
} from "@/lib/projects/student-active-org";
import {
  ensureDemoStudentModeContext,
  isStudentMode,
  resolveParticipationType,
  resolvePermanentRole,
  returnRoleLabel,
} from "@/lib/academic/student-mode";

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
  /** @type {string | null} */
  let activeOrgProjectId = null;
  /** @type {string | null} */
  let activeOrgName = null;
  /** @type {string | null} */
  let activeOrgCode = null;
  /** @type {'PERSONAL' | 'PRACTICE' | 'ASSESSMENT'} */
  let orgContext = "PERSONAL";
  let assessmentLocked = false;
  /** @type {null | { academicProjectId: string; name: string; organizationName: string }} */
  let assessmentLock = null;
  /** @type {null | { academicProjectId: string; name: string; organizationName: string; purpose: string }} */
  let practiceJoinPrompt = null;
  /** @type {null | {
   *   academicProjectId: string;
   *   attemptId: string | null;
   *   projectName: string;
   *   purpose: string;
   *   durationSeconds: number | null;
   *   closeAt: string | Date | null;
   * }} */
  let activeAttempt = null;
  let defaultPath = DEFAULT_POST_AUTH_PATH;

  if (active === Role.STUDENT) {
    try {
      await ensureCoreProjectOrgRoles(prisma);
      await ensureBaselineProcessTemplates(prisma);
      const resolved = await resolveStudentActiveOrganisation(prisma, user.id);
      const org = resolved?.org;
      const personal = resolved?.personal;
      if (personal?.id) {
        personalOrgProjectId = personal.id;
        personalOrgName = personal.organizationName || personal.name || null;
        personalOrgCode = personal.projectCode || null;
      }
      if (org?.id) {
        activeOrgProjectId = org.id;
        activeOrgName = org.organizationName || org.name || null;
        activeOrgCode = org.projectCode || null;
        orgContext = resolved.kind === "ASSESSMENT" || resolved.kind === "PRACTICE"
          ? resolved.kind
          : "PERSONAL";
        assessmentLocked = Boolean(resolved.locked);
        if (resolved.locked && resolved.academicProject) {
          assessmentLock = {
            academicProjectId: resolved.academicProject.id,
            name: resolved.academicProject.name,
            organizationName:
              resolved.academicProject.organizationName || resolved.academicProject.name,
          };
        }
        if (resolved.academicProject && (orgContext === "ASSESSMENT" || orgContext === "PRACTICE")) {
          activeAttempt = {
            academicProjectId: resolved.academicProject.id,
            attemptId: resolved.attempt?.id || null,
            projectName: resolved.academicProject.name,
            purpose: resolved.academicProject.purpose,
            durationSeconds: resolved.academicProject.durationSeconds ?? null,
            closeAt: resolved.academicProject.closeAt || null,
          };
        }
        // Assessment: always land in the assignment organisation. Practice attempt org: resume there.
        defaultPath =
          assessmentLocked || orgContext === "PRACTICE" || orgContext === "ASSESSMENT"
            ? "/organisation"
            : `/`;
      }

      if (!isStudentMode({ grantedRoles: g, activeRole: active }) && !assessmentLocked) {
        const offer = await findStudentPracticeJoinOffer(prisma, user.id);
        if (offer && (orgContext !== "PRACTICE" || offer.academicProjectId !== org?.sourceAcademicProjectId)) {
          practiceJoinPrompt = offer;
        }
      }

      // Student Mode (staff): auto-ensure current AY / demo enrollment / slate.
      if (isStudentMode({ grantedRoles: g, activeRole: active })) {
        const participationType = resolveParticipationType({
          grantedRoles: g,
          activeRole: active,
        });
        if (participationType) {
          await ensureDemoStudentModeContext(user.id, participationType);
        }
      }
    } catch {
      /* keep default path if provisioning fails */
    }
  }

  const permanentRole = resolvePermanentRole(g);
  const participationType = resolveParticipationType({
    grantedRoles: g,
    activeRole: active,
  });
  const studentMode = isStudentMode({ grantedRoles: g, activeRole: active });

  return {
    authenticated: true,
    userId: user.id,
    email: user.email,
    displayName,
    imageUrl,
    theme,
    grantedRoles: g,
    switchableRoles: switchableRoles(g),
    permanentRole,
    activeRole: active,
    effectiveRole: active,
    participationType,
    isStudentMode: studentMode,
    returnRoleLabel: studentMode ? returnRoleLabel(g) : null,
    returnRole: studentMode ? permanentRole : null,
    mustChangePassword: Boolean(user.mustChangePassword),
    personalOrgProjectId,
    personalOrgName,
    personalOrgCode,
    activeOrgProjectId,
    activeOrgName,
    activeOrgCode,
    orgContext,
    assessmentLocked,
    assessmentLock,
    practiceJoinPrompt,
    activeAttempt,
    defaultPath,
  };
}
