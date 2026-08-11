import { Role } from "@prisma/client";
import { actsAsExaminerRole } from "@/lib/projects/access";

/**
 * Scenario A: Examiner/System Admin may observe a student's organisation read-only.
 * Must use effective (active) staff role — never while in Student Mode.
 *
 * @param {{ activeRole: import("@prisma/client").Role | string | null | undefined }} p
 */
export function canObserveStudentOrganisation({ activeRole }) {
  return actsAsExaminerRole(/** @type {import("@prisma/client").Role} */ (activeRole));
}

/**
 * Observation never grants write/manage on the student's personal org.
 * Explicit deny for mutation paths that check this helper.
 *
 * @param {{ activeRole: import("@prisma/client").Role | string | null | undefined }} p
 */
export function canMutateObservedStudentOrganisation({ activeRole }) {
  void activeRole;
  return false;
}

/**
 * @param {import("@prisma/client").AcademicParticipationType | string | null | undefined} participationType
 */
export function observationDemoBadge(participationType) {
  const t = String(participationType || "");
  if (t === "EXAMINER_DEMO") {
    return { kind: "EXAMINER_DEMO", label: "Examiner demo" };
  }
  if (t === "SYSTEM_ADMIN_DEMO") {
    return { kind: "SYSTEM_ADMIN_DEMO", label: "System admin demo" };
  }
  return null;
}

/**
 * Official student performance population excludes DEMO participation (server rule).
 * Requires explicit STUDENT — null/unknown is never official.
 * @param {import("@prisma/client").AcademicParticipationType | string | null | undefined} participationType
 */
export function isOfficialStudentParticipation(participationType) {
  return String(participationType || "") === "STUDENT";
}

export { Role };
