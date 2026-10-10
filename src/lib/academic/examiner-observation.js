import {
  AcademicEnrollmentStatus,
  AcademicParticipationType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatUserDisplayName } from "@/lib/user-display";
import { getCurrentAcademicContext } from "@/lib/academic/academic-context";
import { findStudentPersonalOrg } from "@/lib/projects/student-personal-org";
import {
  deriveOrganisationProcurementProgress,
  listPersonalOrgProgressSummaries,
} from "@/lib/projects/derive-org-progress";
import {
  isOfficialStudentParticipation,
  observationDemoBadge,
} from "@/lib/academic/examiner-observation-access";
import { campusLabel, parseCampus } from "@/lib/campuses";
import { budgetInclude, serializeBudget } from "@/lib/projects/budgets";
import {
  procurementPlanInclude,
  serializeProcurementPlan,
} from "@/lib/projects/procurement-plans";
import { requisitionInclude, serializeRequisition } from "@/lib/projects/requisitions";
import { procurementInclude, serializeProcurement } from "@/lib/projects/procurements";
import {
  orgOpsSlateListWhere,
  resolveCurrentOrgSlateId,
} from "@/lib/academic/org-academic-slate";

/**
 * @param {string} studentUserId
 * @param {{
 *   academicYearId?: string | null;
 *   db?: import("@prisma/client").PrismaClient;
 *   orgProjectId?: string | null;
 *   lite?: boolean;
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

  const org = Object.prototype.hasOwnProperty.call(opts, "orgProjectId")
    ? opts.orgProjectId
      ? await db.project.findFirst({
          where: {
            id: opts.orgProjectId,
            ownerUserId: user.id,
          },
          select: {
            id: true,
            name: true,
            organizationName: true,
            projectCode: true,
            status: true,
            isPersonalOrg: true,
            isAttemptOrg: true,
            sourceAcademicProjectId: true,
          },
        })
      : null
    : await findStudentPersonalOrg(db, user.id);

  /** @type {any} */
  let progress = null;
  /** @type {any[]} */
  let recentActivity = [];
  /** @type {any[]} */
  let players = [];
  /** @type {any[]} */
  let actions = [];
  /** @type {any[]} */
  let liveTasks = [];

  /** @type {any} */
  let work = null;

  if (org?.id) {
    progress = await deriveOrganisationProcurementProgress(org.id, { db });
    const lite = Boolean(opts.lite);
    const [audits, orgUsers, workflowActions, openTasks] = await Promise.all([
      lite ? Promise.resolve([]) : loadOrgAudits(db, org.id, 80),
      db.projectOrgUser.findMany({
        where: { projectId: org.id },
        orderBy: { createdAt: "asc" },
        include: {
          projectOrgRole: { select: { name: true } },
          department: { select: { name: true, code: true } },
        },
      }),
      db.projectOrgWorkflowAction.findMany({
        where: { projectId: org.id },
        orderBy: { createdAt: "desc" },
        take: lite ? 0 : 80,
        include: {
          actor: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              isProjectAdmin: true,
              projectOrgRole: { select: { name: true } },
            },
          },
          instance: {
            select: {
              entityType: true,
              processFlow: { select: { name: true, code: true } },
            },
          },
          task: { select: { title: true, requiredRoleName: true, stepNumber: true } },
        },
      }),
      db.projectOrgWorkflowTask.findMany({
        where: {
          projectId: org.id,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        orderBy: { createdAt: "asc" },
        take: 20,
        include: {
          assignee: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              projectOrgRole: { select: { name: true } },
            },
          },
        },
      }),
    ]);
    recentActivity = audits
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

    players = orgUsers.map((u) => ({
      id: u.id,
      displayName: formatUserDisplayName(u),
      email: u.email,
      roleName: u.projectOrgRole?.name || null,
      departmentName: u.department?.name || null,
      isProjectAdmin: Boolean(u.isProjectAdmin),
      lastLoginAt: u.lastLoginAt,
    }));

    actions = workflowActions.map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      decision: a.decision,
      comment: a.comment || null,
      actorName: a.actor ? formatUserDisplayName(a.actor) : null,
      actorRole: a.actorRoleName || a.actor?.projectOrgRole?.name || null,
      processName: a.instance?.processFlow?.name || null,
      taskTitle: a.task?.title || null,
      previousStatus: a.previousStatus || null,
      newStatus: a.newStatus || null,
    }));

    liveTasks = openTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      role: t.requiredRoleName || t.assignee?.projectOrgRole?.name || null,
      assignee: t.assignee ? formatUserDisplayName(t.assignee) : null,
      createdAt: t.createdAt,
    }));

    work = lite ? null : await loadObservationWorkDossier(db, org.id);
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
      campus: user.studentProfile?.campus || null,
      campusLabel: campusLabel(user.studentProfile?.campus) || null,
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
          name: org.name,
          displayName: org.organizationName || org.name,
          projectCode: org.projectCode,
          status: org.status,
        }
      : null,
    progress,
    remainingStages: progress?.remainingStages || [],
    players,
    actions,
    liveTasks,
    work,
    recentActivity,
  };
}

/**
 * Full submitted work for examiner inspection (read-only). Reuses operational
 * serializers — does not alter procurement records.
 *
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} projectId
 */
async function loadObservationWorkDossier(db, projectId) {
  let slateWhere = {};
  try {
    const slateId = await resolveCurrentOrgSlateId(db, projectId);
    slateWhere = orgOpsSlateListWhere(slateId);
  } catch {
    slateWhere = {};
  }

  const [financialYears, departments, budgets, plans, requisitions, procurements] =
    await Promise.all([
      db.projectOrgFinancialYear.findMany({
        where: { projectId },
        orderBy: { startDate: "desc" },
        take: 20,
      }),
      db.projectOrgDepartment.findMany({
        where: { projectId },
        orderBy: { name: "asc" },
        take: 80,
        select: {
          id: true,
          name: true,
          code: true,
          unitType: true,
          isActive: true,
          parentId: true,
        },
      }),
      db.projectOrgBudget.findMany({
        where: { projectId, ...slateWhere },
        orderBy: { updatedAt: "desc" },
        take: 30,
        include: budgetInclude,
      }),
      db.projectOrgProcurementPlan.findMany({
        where: { projectId, ...slateWhere },
        orderBy: { updatedAt: "desc" },
        take: 30,
        include: procurementPlanInclude,
      }),
      db.projectOrgRequisition.findMany({
        where: { projectId, ...slateWhere },
        orderBy: { updatedAt: "desc" },
        take: 30,
        include: requisitionInclude,
      }),
      db.projectOrgProcurement.findMany({
        where: { projectId, ...slateWhere },
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: procurementInclude,
      }),
    ]);

  return {
    financialYears: financialYears.map((fy) => ({
      id: fy.id,
      label: fy.label,
      startDate: fy.startDate,
      endDate: fy.endDate,
      isActive: fy.isActive,
      description: fy.description || null,
    })),
    departments: departments.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code || null,
      unitType: d.unitType || null,
      isActive: d.isActive,
      parentId: d.parentId || null,
    })),
    budgets: budgets.map(serializeBudget),
    plans: plans.map(serializeProcurementPlan),
    requisitions: requisitions.map(serializeRequisition),
    procurements: procurements.map((p) => serializeProcurement(p)),
  };
}

/**
 * Roster for observation: real students + demo enrollments for selected year.
 * Defaults to current academic year. Page is paginated; org + current stage
 * are attached only for the current page.
 *
 * @param {{
 *   q?: string;
 *   academicYearId?: string | null;
 *   campus?: string | null;
 *   participation?: 'all' | 'students' | 'demo';
 *   page?: number;
 *   pageSize?: number;
 *   db?: import("@prisma/client").PrismaClient;
 * }} [opts]
 */
export async function listExaminerObservationStudents(opts = {}) {
  const db = opts.db || prisma;
  const university = await getCurrentAcademicContext(db);
  const yearId = opts.academicYearId || university.academicYear?.id || null;
  const campus = parseCampus(opts.campus);
  const participation = opts.participation || "all";
  const q = (opts.q || "").trim();
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(opts.pageSize) || 20));

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

  if (campus) {
    where.user = { studentProfile: { is: { campus } } };
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
        studentProfile: campus
          ? { is: { campus } }
          : { isNot: null },
        academicEnrollments: yearId
          ? { none: { academicYearId: yearId } }
          : { none: { status: AcademicEnrollmentStatus.ACTIVE } },
        ...(q
          ? {
              OR: [
                { email: { contains: q } },
                { firstName: { contains: q } },
                { lastName: { contains: q } },
                { studentProfile: { is: { studentNumber: { contains: q } } } },
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
      if (campus && e.user?.studentProfile?.campus !== campus) return false;
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

  const allStudents = [...fromEnrollments, ...fromProfiles];
  const total = allStudents.length;
  const start = (page - 1) * pageSize;
  const pageRows = allStudents.slice(start, start + pageSize);

  const progressByOwner = await listPersonalOrgProgressSummaries(
    pageRows.map((r) => r.id),
    { db },
  );

  const students = pageRows.map((row) => {
    const extra = progressByOwner.get(row.id);
    return {
      ...row,
      organisation: extra?.organisation || null,
      currentStageKey: extra?.summary?.currentStageKey || null,
      currentStageLabel: extra?.summary?.currentStageLabel || (extra ? "Not started" : null),
      progressPercent: extra?.summary?.percent ?? null,
      counts: extra?.counts || null,
    };
  });

  const years = await db.academicYear.findMany({
    orderBy: { label: "desc" },
    take: 12,
    select: { id: true, label: true, isCurrent: true },
  });

  return {
    academicYear: yearId
      ? years.find((y) => y.id === yearId) || university.academicYear
      : university.academicYear,
    availableYears: years,
    page,
    pageSize,
    total,
    students,
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
    registrationNumber: user.studentProfile?.registrationNumber || null,
    programmeShortName: user.studentProfile?.programme?.shortName || null,
    programmeName: user.studentProfile?.programme?.name || null,
    yearOfStudy: user.studentProfile?.yearOfStudy || null,
    campus: user.studentProfile?.campus || null,
    campusLabel: campusLabel(user.studentProfile?.campus) || null,
    lastLoginAt: user.lastLoginAt || null,
    enrollmentStatus: enrollment?.status || null,
    participationType,
    demoBadge: badge,
    includeInOfficialStats: isOfficialStudentParticipation(participationType),
    academicYearLabel: enrollment?.academicYear?.label || user.studentProfile?.academicYearLabel || null,
    observePath: `/students/${user.id}/observe`,
  };
}

/**
 * Latest organisation audit events, filtered by organisation in the query.
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} projectId
 * @param {number} take
 */
async function loadOrgAudits(db, projectId, take) {
  try {
    return await db.auditLog.findMany({
      where: {
        eventType: { startsWith: "PROJECT_ORG_" },
        meta: { path: "$.projectId", equals: projectId },
      },
      orderBy: { createdAt: "desc" },
      take,
    });
  } catch {
    const rows = await db.auditLog.findMany({
      where: { eventType: { startsWith: "PROJECT_ORG_" } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    return rows
      .filter((a) => a.meta && typeof a.meta === "object" && /** @type {any} */ (a.meta).projectId === projectId)
      .slice(0, take);
  }
}

/** @param {string} eventType */
function humanEvent(eventType) {
  return String(eventType || "")
    .replace(/^PROJECT_ORG_/, "")
    .replace(/_/g, " ")
    .toLowerCase();
}
