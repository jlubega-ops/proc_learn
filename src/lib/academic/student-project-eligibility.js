import { AcademicEnrollmentStatus, ProjectPurpose, Role } from "@prisma/client";
import { parseCampus } from "@/lib/campuses";
import { projectCampusWhere } from "@/lib/academic/project-campuses";

/**
 * A project is meant for a student when its academic year, programme and campuses match the
 * student. Unset academic year / programme / campuses on the project mean "any".
 */

/**
 * @typedef {{
 *   studentUserId: string;
 *   programmeId: string | null;
 *   campus: string | null;
 *   anyCampus?: boolean;
 *   academicYearIds: string[];
 * }} StudentEligibilityContext
 */

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {string} studentUserId
 * @returns {Promise<StudentEligibilityContext>}
 */
export async function loadStudentEligibilityContext(db, studentUserId) {
  const [profile, enrollments, settings] = await Promise.all([
    db.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: { programmeId: true, campus: true },
    }),
    db.studentAcademicEnrollment.findMany({
      where: { userId: studentUserId, status: AcademicEnrollmentStatus.ACTIVE },
      select: { academicYearId: true },
    }),
    db.userSettings.findUnique({
      where: { userId: studentUserId },
      select: { studentViewProgrammeId: true, studentViewCampus: true },
    }),
  ]);
  const academicYearIds = enrollments.map((e) => e.academicYearId);
  if (!profile) {
    // Staff in Student Mode: programme/campus chosen on switch (campus null = all campuses).
    const campus = parseCampus(settings?.studentViewCampus);
    return {
      studentUserId,
      programmeId: settings?.studentViewProgrammeId || null,
      campus,
      anyCampus: !campus,
      academicYearIds,
    };
  }
  return {
    studentUserId,
    programmeId: profile.programmeId || null,
    campus: parseCampus(profile.campus),
    academicYearIds,
  };
}

/**
 * Projects meant for this student (AY + programme + campus).
 * @param {StudentEligibilityContext} ctx
 * @returns {import("@prisma/client").Prisma.ProjectWhereInput}
 */
export function studentEligibleProjectWhere(ctx) {
  return {
    AND: [
      {
        OR: [
          { academicYearId: null },
          ...(ctx.academicYearIds.length ? [{ academicYearId: { in: ctx.academicYearIds } }] : []),
        ],
      },
      {
        OR: [{ programmeId: null }, ...(ctx.programmeId ? [{ programmeId: ctx.programmeId }] : [])],
      },
      ...(ctx.anyCampus ? [] : [projectCampusWhere(ctx.campus)]),
    ],
  };
}

/**
 * Eligible projects plus any the student already joined (joined work stays reachable).
 * @param {StudentEligibilityContext} ctx
 * @returns {import("@prisma/client").Prisma.ProjectWhereInput}
 */
export function studentVisibleAcademicProjectWhere(ctx) {
  return {
    OR: [
      studentEligibleProjectWhere(ctx),
      { enrollments: { some: { studentUserId: ctx.studentUserId } } },
    ],
  };
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{ projectId: string; studentUserId: string }} p
 * @returns {Promise<boolean>}
 */
export async function isProjectMeantForStudent(db, { projectId, studentUserId }) {
  const ctx = await loadStudentEligibilityContext(db, studentUserId);
  const row = await db.project.findFirst({
    where: { id: projectId, ...studentEligibleProjectWhere(ctx) },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Published examiner projects open right now (window-wise).
 * @param {Date} now
 * @returns {import("@prisma/client").Prisma.ProjectWhereInput}
 */
function openAcademicProjectWhere(now) {
  return {
    creatorRole: Role.EXAMINER,
    requiresEnrollment: true,
    isPublished: true,
    visibility: "PUBLIC",
    isPersonalOrg: false,
    isAttemptOrg: false,
    AND: [
      { OR: [{ openAt: null }, { openAt: { lte: now } }] },
      { OR: [{ closeAt: null }, { closeAt: { gte: now } }] },
    ],
  };
}

/**
 * Open Practice / Assessment projects meant for the student that they have not submitted yet.
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} studentUserId
 * @returns {Promise<{ practice: number; assessments: number }>}
 */
export async function countOpenAcademicProjectsForStudent(db, studentUserId) {
  const ctx = await loadStudentEligibilityContext(db, studentUserId);
  const now = new Date();
  const base = {
    ...openAcademicProjectWhere(now),
    enrollments: { none: { studentUserId, status: "SUBMITTED" } },
  };
  const [practice, assessments] = await Promise.all([
    db.project.count({
      where: { AND: [base, { purpose: ProjectPurpose.PRACTICE }, studentEligibleProjectWhere(ctx)] },
    }),
    db.project.count({
      where: {
        AND: [base, { purpose: ProjectPurpose.ASSESSMENT }, studentEligibleProjectWhere(ctx)],
      },
    }),
  ]);
  return { practice, assessments };
}

/**
 * Active student accounts (and staff following its programme in Student Mode) a project is meant for.
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {string} projectId
 * @returns {Promise<string[]>}
 */
export async function eligibleStudentIdsForProject(db, projectId) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      ownerUserId: true,
      academicYearId: true,
      programmeId: true,
      campuses: { select: { campus: true } },
    },
  });
  if (!project) return [];
  const campuses = project.campuses.map((c) => c.campus);
  const yearWhere = project.academicYearId
    ? {
        academicEnrollments: {
          some: {
            academicYearId: project.academicYearId,
            status: AcademicEnrollmentStatus.ACTIVE,
          },
        },
      }
    : {};
  const users = await db.user.findMany({
    where: {
      accountStatus: { not: "SUSPENDED" },
      ...yearWhere,
      OR: [
        {
          userRoles: { some: { role: Role.STUDENT } },
          studentProfile: {
            is: {
              ...(project.programmeId ? { programmeId: project.programmeId } : {}),
              ...(campuses.length ? { campus: { in: campuses } } : {}),
            },
          },
        },
        {
          // Staff following a programme in Student Mode (campus null = all campuses).
          id: { not: project.ownerUserId },
          studentProfile: { is: null },
          settings: {
            is: {
              studentViewProgrammeId: project.programmeId
                ? project.programmeId
                : { not: null },
              ...(campuses.length
                ? { OR: [{ studentViewCampus: null }, { studentViewCampus: { in: campuses } }] }
                : {}),
            },
          },
        },
      ],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
