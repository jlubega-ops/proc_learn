import { AcademicParticipationType, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ensureCurrentAcademicContext,
  getCurrentAcademicContext,
} from "@/lib/academic/academic-context";
import { ensureActiveEnrollment } from "@/lib/academic/student-enrollment";
import { ensureCurrentOrgSlateForOwner } from "@/lib/academic/org-academic-slate";
import { ensureStudentPersonalOrg } from "@/lib/projects/student-personal-org";
import {
  isStaffRole,
  pickHighestGrantedRole,
  ROLE,
} from "@/lib/roles";

/**
 * Permanent (granted) role — highest precedence among DB grants.
 * @param {string[]} granted
 */
export function resolvePermanentRole(granted) {
  return pickHighestGrantedRole(granted);
}

/**
 * Academic participation type. Not derived only from effective role.
 * @param {{ grantedRoles: string[]; activeRole: string | null | undefined }} p
 * @returns {import("@prisma/client").AcademicParticipationType | null}
 */
export function resolveParticipationType({ grantedRoles, activeRole }) {
  if (String(activeRole || "") !== ROLE.STUDENT) return null;
  const set = new Set(grantedRoles || []);
  if (set.has(ROLE.SYSTEM_ADMIN)) return AcademicParticipationType.SYSTEM_ADMIN_DEMO;
  if (set.has(ROLE.EXAMINER)) return AcademicParticipationType.EXAMINER_DEMO;
  return AcademicParticipationType.STUDENT;
}

/**
 * Staff account currently viewing as Student (Student Mode).
 * @param {{ grantedRoles: string[]; activeRole: string | null | undefined }} p
 */
export function isStudentMode({ grantedRoles, activeRole }) {
  return (
    String(activeRole || "") === ROLE.STUDENT &&
    (grantedRoles || []).some((r) => isStaffRole(r))
  );
}

/**
 * Label for returning from Student Mode.
 * @param {string[]} grantedRoles
 */
export function returnRoleLabel(grantedRoles) {
  const permanent = resolvePermanentRole(grantedRoles);
  if (permanent === ROLE.SYSTEM_ADMIN) return "Return to Admin";
  if (permanent === ROLE.EXAMINER) return "Return to Examiner";
  return "Return";
}

/**
 * Ensure demo academic context for Student Mode (no join prompt, no StudentProfile required).
 * Same My Organisation; new AY → new enrollment + CURRENT slate; history preserved.
 *
 * @param {string} userId
 * @param {import("@prisma/client").AcademicParticipationType} participationType
 * @param {import("@prisma/client").PrismaClient} [db]
 */
export async function ensureDemoStudentModeContext(
  userId,
  participationType,
  db = prisma,
) {
  if (
    participationType !== AcademicParticipationType.EXAMINER_DEMO &&
    participationType !== AcademicParticipationType.SYSTEM_ADMIN_DEMO
  ) {
    throw new Error("Demo context requires EXAMINER_DEMO or SYSTEM_ADMIN_DEMO.");
  }

  let university = await getCurrentAcademicContext(db);
  if (!university.academicYear?.id || !university.semester?.id) {
    university = await ensureCurrentAcademicContext(db);
  }
  if (!university.academicYear?.id) {
    const err = new Error("No current academic year is configured.");
    // @ts-ignore
    err.code = "NO_CURRENT_YEAR";
    throw err;
  }

  const org = await ensureStudentPersonalOrg(db, userId);
  if (!org?.id) {
    const err = new Error("Could not open My Organisation for Student Mode.");
    // @ts-ignore
    err.code = "NO_PERSONAL_ORG";
    throw err;
  }

  const enrollmentResult = await ensureActiveEnrollment(db, {
    userId,
    academicYearId: university.academicYear.id,
    participationType,
    syncProfileLabel: false,
  });

  const slateResult = await ensureCurrentOrgSlateForOwner(db, userId);

  return {
    academicYear: university.academicYear,
    semester: university.semester,
    enrollment: enrollmentResult.enrollment,
    enrollmentCreated: enrollmentResult.created,
    orgAcademicSlate: slateResult?.slate || null,
    slateCreated: Boolean(slateResult?.created),
    projectId: org.id,
  };
}

/**
 * @param {string[]} grantedRoles
 */
export function permanentRoleIsStaff(grantedRoles) {
  return (grantedRoles || []).some((r) => isStaffRole(r));
}

export { AcademicParticipationType, Role };
