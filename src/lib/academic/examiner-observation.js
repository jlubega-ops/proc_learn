import {
  AcademicEnrollmentStatus,
  AcademicParticipationType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatUserDisplayName } from "@/lib/user-display";
import { getCurrentAcademicContext } from "@/lib/academic/academic-context";
import { findStudentPersonalOrg } from "@/lib/projects/student-personal-org";
import { deriveOrganisationProcurementProgress } from "@/lib/projects/derive-org-progress";
import {
  isOfficialStudentParticipation,
  observationDemoBadge,
} from "@/lib/academic/examiner-observation-access";

/**
 * @param {string} studentUserId
 * @param {{
 *   academicYearId?: string | null;
 *   db?: import("@prisma/client").PrismaClient;
 * }} [opts]
 */
export async function getExaminerStudentObservation(studentUserId, opts = {}) {
  const db = opts.db || prisma;
  const university = await getCurrentAcademicContext(db);

  const user = await db.user.findUnique({
    where: { id: studentUserId },
    include: {
      studentProfile: { include: { programme: true } },
      userRoles: true,
      settings: true,
      academicEnrollments: {
        include: { academicYear: true },
        orderBy: [{ status: "asc" }, { academicYear: { label: "desc" } }],
      },
    },
  });

  if (!user) {
    const err = new Error("Student not found.");
    // @ts-ignore
    err.code = "NOT_FOUND";
    throw err;
  }

  const hasStudentProfile = Boolean(user.studentProfile);
  const hasDemoEnrollment = user.academicEnrollments.some((e) =>
    [
      AcademicParticipationType.EXAMINER_DEMO,
      AcademicParticipationType.SYSTEM_ADMIN_DEMO,
    ].includes(e.participationType),
  );
  if (!hasStudentProfile && !hasDemoEnrollment) {
    const err = new Error("Student not found.");
    // @ts-ignore
    err.code = "NOT_FOUND";
    throw err;
  }

  const requestedYearId = opts.academicYearId || university.academicYear?.id || null;

  let enrollment =
    (requestedYearId &&
      user.academicEnrollments.find((e) => e.academicYearId === requestedYearId)) ||
    user.academicEnrollments.find((e) => e.status === AcademicEnrollmentStatus.ACTIVE) ||
    null;

  const participationType = enrollment?.participationType || null;
  const demoBadge = observationDemoBadge(participationType);
  const official = isOfficialStudentParticipation(participationType);

  // Resolve semester for the enrollment year (active preferred)
  let semester = university.semester;
  if (enrollment?.academicYearId) {
    const activeSem = await db.semester.findFirst({
      where: { academicYearId: enrollment.academicYearId, isActive: true },
    });
    const anySem = activeSem
      ? activeSem
      : await db.semester.findFirst({
          where: { academicYearId: enrollment.academicYearId },
          orderBy: { startDate: "asc" },
        });
    semester = anySem
      ? {
          id: anySem.id,
          name: anySem.name,
          isActive: anySem.isActive,
          academicYearId: anySem.academicYearId,
        }
      : null;
  }

  const org = await findStudentPersonalOrg(db, user.id);

  /** @type {any} */
  let progress = null;
  /** @type {any[]} */
  let recentActivity = [];

  if (org?.id) {
    progress = await deriveOrganisationProcurementProgress(org.id, { db });
    const audits = await db.auditLog.findMany({
      where: {
        eventType: { startsWith: "PROJECT_ORG_" },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    });
    recentActivity = audits
      .filter((a) => {
        const meta = /** @type {any} */ (a.meta);
        return meta && meta.projectId === org.id;
      })
      .slice(0, 15)
      .map((a) => ({
        id: a.id,
        eventType: a.eventType,
        createdAt: a.createdAt,
        description:
          (a.meta && typeof a.meta === "object" && "description" in /** @type {any} */ (a.meta)
            ? /** @type {any} */ (a.meta).description
            : null) || humanEvent(a.eventType),
      }));
  }

  const years = await db.academicYear.findMany({
    orderBy: { label: "desc" },
    take: 12,
    select: { id: true, label: true, isCurrent: true },
  });

  return {
    readOnly: true,
    student: {
      id: user.id,
      email: user.email,
      displayName: formatUserDisplayName(user),
      accountStatus: user.accountStatus,
      studentNumber: user.studentProfile?.studentNumber || null,
      registrationNumber: user.studentProfile?.registrationNumber || null,
      programmeName: user.studentProfile?.programme?.name || null,
      programmeShortName: user.studentProfile?.programme?.shortName || null,
      yearOfStudy: user.studentProfile?.yearOfStudy || null,
      lastLoginAt: user.lastLoginAt,
      hasStudentProfile: Boolean(user.studentProfile),
    },
    academic: {
      currentUniversityYear: university.academicYear
        ? {
            id: university.academicYear.id,
            label: university.academicYear.label,
            isCurrent: true,
          }
        : null,
      selectedYearId: requestedYearId,
      enrollment: enrollment
        ? {
            id: enrollment.id,
            status: enrollment.status,
            participationType: enrollment.participationType,
            joinedAt: enrollment.joinedAt,
            academicYear: enrollment.academicYear
              ? {
                  id: enrollment.academicYear.id,
                  label: enrollment.academicYear.label,
                  isCurrent: enrollment.academicYear.isCurrent,
                }
              : null,
          }
        : null,
      semester: semester
        ? {
            id: semester.id,
            name: semester.name,
            isActive: semester.isActive,
          }
        : null,
      availableYears: years,
      enrollments: user.academicEnrollments.map((e) => ({
        id: e.id,
        status: e.status,
        participationType: e.participationType,
        academicYearId: e.academicYearId,
        label: e.academicYear?.label || null,
      })),
    },
    demo: {
      isDemo: Boolean(demoBadge),
      badge: demoBadge,
      includeInOfficialStats: official,
    },
    organisation: org
      ? {
          projectId: org.id,
          name: org.organizationName || org.name,
          projectCode: org.projectCode,
          status: org.status,
        }
      : null,
    progress,
    recentActivity,
  };
}

/**
 * Roster for observation: real students + demo enrollments for selected year.
 * Defaults to current academic year.
 *
 * @param {{
 *   q?: string;
 *   academicYearId?: string | null;
 *   participation?: 'all' | 'students' | 'demo';
 *   db?: import("@prisma/client").PrismaClient;
 * }} [opts]
 */
export async function listExaminerObservationStudents(opts = {}) {
  const db = opts.db || prisma;
  const university = await getCurrentAcademicContext(db);
  const yearId = opts.academicYearId || university.academicYear?.id || null;
  const participation = opts.participation || "all";
  const q = (opts.q || "").trim();

  /** @type {import("@prisma/client").Prisma.StudentAcademicEnrollmentWhereInput} */
  const where = {
    status: AcademicEnrollmentStatus.ACTIVE,
    ...(yearId ? { academicYearId: yearId } : {}),
  };

  if (participation === "students") {
    where.participationType = AcademicParticipationType.STUDENT;
  } else if (participation === "demo") {
    where.participationType = {
      in: [
        AcademicParticipationType.EXAMINER_DEMO,
        AcademicParticipationType.SYSTEM_ADMIN_DEMO,
      ],
    };
  }

  const enrollments = await db.studentAcademicEnrollment.findMany({
    where,
    include: {
      academicYear: true,
      user: {
        include: {
          studentProfile: { include: { programme: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
    take: 500,
  });

  /** Also include students with profile but no enrollment yet (real students waiting to join). */
  let profileOnly = [];
  if (participation !== "demo") {
    profileOnly = await db.user.findMany({
      where: {
        studentProfile: { isNot: null },
        academicEnrollments: yearId
          ? { none: { academicYearId: yearId } }
          : { none: { status: AcademicEnrollmentStatus.ACTIVE } },
        ...(q
          ? {
              OR: [
                { email: { contains: q } },
                { firstName: { contains: q } },
                { lastName: { contains: q } },
                { studentProfile: { studentNumber: { contains: q } } },
              ],
            }
          : {}),
      },
      include: {
        studentProfile: { include: { programme: true } },
      },
      take: 200,
      orderBy: { createdAt: "desc" },
    });
  }

  const fromEnrollments = enrollments
    .filter((e) => {
      if (!q) return true;
      const u = e.user;
      const hay = [
        u.email,
        u.firstName,
        u.lastName,
        u.middleName,
        u.studentProfile?.studentNumber,
        u.studentProfile?.registrationNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q.toLowerCase());
    })
    .map((e) => serializeObservationRow(e.user, e));

  const enrolledIds = new Set(fromEnrollments.map((r) => r.id));
  const fromProfiles = profileOnly
    .filter((u) => !enrolledIds.has(u.id))
    .map((u) => serializeObservationRow(u, null));

  return {
    academicYear: university.academicYear
      ? { id: university.academicYear.id, label: university.academicYear.label }
      : null,
    semester: university.semester
      ? { id: university.semester.id, name: university.semester.name }
      : null,
    students: [...fromEnrollments, ...fromProfiles],
  };
}

/**
 * @param {any} user
 * @param {any} enrollment
 */
function serializeObservationRow(user, enrollment) {
  const participationType = enrollment?.participationType || AcademicParticipationType.STUDENT;
  const badge = observationDemoBadge(participationType);
  return {
    id: user.id,
    email: user.email,
    displayName: formatUserDisplayName(user),
    studentNumber: user.studentProfile?.studentNumber || null,
    programmeShortName: user.studentProfile?.programme?.shortName || null,
    programmeName: user.studentProfile?.programme?.name || null,
    enrollmentStatus: enrollment?.status || null,
    participationType,
    demoBadge: badge,
    includeInOfficialStats: isOfficialStudentParticipation(participationType),
    academicYearLabel: enrollment?.academicYear?.label || user.studentProfile?.academicYearLabel || null,
    observePath: `/students/${user.id}/observe`,
  };
}

/** @param {string} eventType */
function humanEvent(eventType) {
  return String(eventType || "")
    .replace(/^PROJECT_ORG_/, "")
    .replace(/_/g, " ")
    .toLowerCase();
}
