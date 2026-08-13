/**
 * Which organisation shell a student is currently working in.
 * Assessment: locked to the attempt workspace until the academic project window closes.
 * Practice: can switch back to My Organisation.
 */
import { ProjectAttemptStatus, ProjectPurpose, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureStudentPersonalOrg, findStudentPersonalOrg } from "@/lib/projects/student-personal-org";
import { findStudentAttemptOrg } from "@/lib/projects/student-attempt-org";

/**
 * @param {any} project
 * @param {Date} [now]
 */
export function isAcademicProjectWindowOpen(project, now = new Date()) {
  const t = now.getTime();
  if (project?.openAt && new Date(project.openAt).getTime() > t) return false;
  if (project?.closeAt && new Date(project.closeAt).getTime() < t) return false;
  return true;
}

const ATTEMPT_LOCK_STATUSES = new Set([
  ProjectAttemptStatus.IN_PROGRESS,
  ProjectAttemptStatus.RETURNED,
  ProjectAttemptStatus.SUBMITTED,
  ProjectAttemptStatus.UNDER_REVIEW,
  ProjectAttemptStatus.COMPLETED,
]);

/**
 * @param {any} org
 */
export function serializeOrgShell(org) {
  if (!org?.id) return null;
  return {
    projectId: org.id,
    organizationName: org.organizationName || null,
    name: org.name,
    projectCode: org.projectCode || null,
    isPersonalOrg: Boolean(org.isPersonalOrg),
    isAttemptOrg: Boolean(org.isAttemptOrg),
    sourceAcademicProjectId: org.sourceAcademicProjectId || null,
    purpose: org.purpose || null,
  };
}

/**
 * Another Practice/Assessment attempt that is still in progress (blocks starting a second project).
 *
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} studentUserId
 * @param {{ excludeAcademicProjectId?: string | null }} [opts]
 */
export async function findStudentInProgressAttempt(db, studentUserId, opts = {}) {
  const excludeId = opts.excludeAcademicProjectId || null;
  const enrollments = await db.projectEnrollment.findMany({
    where: {
      studentUserId,
      project: {
        creatorRole: Role.EXAMINER,
        requiresEnrollment: true,
        isPublished: true,
        isPersonalOrg: false,
        isAttemptOrg: false,
        purpose: { in: [ProjectPurpose.PRACTICE, ProjectPurpose.ASSESSMENT] },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    },
    include: {
      project: true,
      attempts: {
        where: {
          status: {
            in: [ProjectAttemptStatus.IN_PROGRESS, ProjectAttemptStatus.RETURNED],
          },
        },
        orderBy: { attemptNumber: "desc" },
        take: 1,
      },
    },
    orderBy: { enrolledAt: "desc" },
    take: 40,
  });

  for (const enrollment of enrollments) {
    const attempt = enrollment.attempts?.[0];
    if (!attempt) continue;
    return {
      academicProject: enrollment.project,
      enrollment,
      attempt,
    };
  }
  return null;
}

/**
 * Open published Assessment the student has started — they cannot return to My Organisation.
 *
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} studentUserId
 */
export async function findStudentAssessmentLock(db, studentUserId) {
  const enrollments = await db.projectEnrollment.findMany({
    where: {
      studentUserId,
      project: {
        purpose: ProjectPurpose.ASSESSMENT,
        creatorRole: Role.EXAMINER,
        requiresEnrollment: true,
        isPublished: true,
        isPersonalOrg: false,
        isAttemptOrg: false,
      },
    },
    include: {
      project: true,
      attempts: { orderBy: { attemptNumber: "desc" }, take: 4 },
    },
    orderBy: { enrolledAt: "desc" },
    take: 20,
  });

  for (const enrollment of enrollments) {
    if (!isAcademicProjectWindowOpen(enrollment.project)) continue;
    const started = (enrollment.attempts || []).find((a) =>
      ATTEMPT_LOCK_STATUSES.has(a.status),
    );
    if (!started) continue;

    let workspace = null;
    if (started.workspaceProjectId) {
      workspace = await db.project.findFirst({
        where: { id: started.workspaceProjectId, ownerUserId: studentUserId },
        select: {
          id: true,
          name: true,
          organizationName: true,
          projectCode: true,
          status: true,
          isPersonalOrg: true,
          isAttemptOrg: true,
          sourceAcademicProjectId: true,
          purpose: true,
        },
      });
    }
    if (!workspace) {
      workspace = await findStudentAttemptOrg(db, {
        studentUserId,
        academicProjectId: enrollment.projectId,
      });
    }
    if (!workspace) continue;

    return {
      academicProject: enrollment.project,
      enrollment,
      attempt: started,
      workspace,
    };
  }

  return null;
}

/**
 * Best Practice academic project to offer on login (in-progress first, else newest open catalog item).
 *
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} studentUserId
 */
export async function findStudentPracticeJoinOffer(db, studentUserId) {
  const now = new Date();
  const catalog = await db.project.findMany({
    where: {
      purpose: ProjectPurpose.PRACTICE,
      creatorRole: Role.EXAMINER,
      requiresEnrollment: true,
      isPublished: true,
      isPersonalOrg: false,
      isAttemptOrg: false,
      visibility: "PUBLIC",
      AND: [
        { OR: [{ openAt: null }, { openAt: { lte: now } }] },
        { OR: [{ closeAt: null }, { closeAt: { gte: now } }] },
      ],
    },
    orderBy: [{ createdAt: "desc" }],
    take: 30,
  });
  if (!catalog.length) return null;

  const enrollments = await db.projectEnrollment.findMany({
    where: {
      studentUserId,
      projectId: { in: catalog.map((p) => p.id) },
    },
    include: {
      attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
    },
  });
  const byProject = new Map(enrollments.map((e) => [e.projectId, e]));

  const inProgress = catalog.find((project) => {
    const latest = byProject.get(project.id)?.attempts?.[0];
    return (
      latest &&
      (latest.status === ProjectAttemptStatus.IN_PROGRESS ||
        latest.status === ProjectAttemptStatus.RETURNED)
    );
  });
  const project = inProgress || catalog[0];
  if (!project) return null;

  return {
    academicProjectId: project.id,
    name: project.name,
    organizationName: project.organizationName || project.name,
    purpose: project.purpose,
    enrolled: byProject.has(project.id),
  };
}

/**
 * Persist which org shell the student is in.
 *
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} userId
 * @param {string | null} projectId
 */
export async function persistStudentActiveOrg(db, userId, projectId) {
  await db.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      theme: "light",
      activeRole: Role.STUDENT,
      activeOrgProjectId: projectId,
    },
    update: { activeOrgProjectId: projectId },
  });
}

/**
 * Resolve (and persist assessment lock) the organisation the student should work in now.
 *
 * @param {import("@prisma/client").PrismaClient} [db]
 * @param {string} userId
 */
export async function resolveStudentActiveOrganisation(db = prisma, userId) {
  const personal = await ensureStudentPersonalOrg(db, userId);
  if (!personal?.id) return null;

  const lock = await findStudentAssessmentLock(db, userId);
  if (lock?.workspace?.id) {
    await persistStudentActiveOrg(db, userId, lock.workspace.id);
    return {
      org: lock.workspace,
      kind: "ASSESSMENT",
      locked: true,
      academicProject: lock.academicProject,
      attempt: lock.attempt || null,
      personal,
    };
  }

  const settings = await db.userSettings.findUnique({
    where: { userId },
    select: { activeOrgProjectId: true },
  });
  const storedId = settings?.activeOrgProjectId || null;
  if (storedId && storedId !== personal.id) {
    const stored = await db.project.findFirst({
      where: {
        id: storedId,
        ownerUserId: userId,
        isAttemptOrg: true,
        sourceAcademicProject: {
          purpose: ProjectPurpose.PRACTICE,
          isPublished: true,
        },
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
        purpose: true,
        sourceAcademicProject: true,
      },
    });
    if (stored && isAcademicProjectWindowOpen(stored.sourceAcademicProject)) {
      const { sourceAcademicProject, ...org } = stored;
      let attempt = null;
      if (sourceAcademicProject?.id) {
        const enrollment = await db.projectEnrollment.findUnique({
          where: {
            projectId_studentUserId: {
              projectId: sourceAcademicProject.id,
              studentUserId: userId,
            },
          },
          include: {
            attempts: {
              where: {
                status: {
                  in: [ProjectAttemptStatus.IN_PROGRESS, ProjectAttemptStatus.RETURNED],
                },
              },
              orderBy: { attemptNumber: "desc" },
              take: 1,
            },
          },
        });
        attempt = enrollment?.attempts?.[0] || null;
      }
      return {
        org,
        kind: "PRACTICE",
        locked: false,
        academicProject: sourceAcademicProject,
        attempt,
        personal,
      };
    }
  }

  if (storedId && storedId !== personal.id) {
    await persistStudentActiveOrg(db, userId, personal.id);
  }

  return {
    org: personal,
    kind: "PERSONAL",
    locked: false,
    academicProject: null,
    attempt: null,
    personal,
  };
}

/**
 * Switch to My Organisation (blocked while an Assessment is locking).
 *
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} userId
 */
export async function switchStudentToPersonalOrg(db, userId) {
  const lock = await findStudentAssessmentLock(db, userId);
  if (lock?.workspace?.id) {
    const err = new Error(
      "You cannot leave this assessment organisation until the assessment closes.",
    );
    // @ts-ignore
    err.code = "ASSESSMENT_LOCKED";
    throw err;
  }
  const personal = await ensureStudentPersonalOrg(db, userId);
  if (!personal?.id) {
    const err = new Error("My Organisation is not available.");
    // @ts-ignore
    err.code = "NO_ORG";
    throw err;
  }
  await persistStudentActiveOrg(db, userId, personal.id);
  return { org: personal, kind: "PERSONAL", locked: false };
}

/**
 * Switch into an existing attempt workspace (does not start an attempt).
 *
 * @param {import("@prisma/client").PrismaClient} db
 * @param {{ userId: string; academicProjectId: string }} p
 */
export async function switchStudentToAttemptOrg(db, { userId, academicProjectId }) {
  const lock = await findStudentAssessmentLock(db, userId);
  if (lock?.academicProject?.id && lock.academicProject.id !== academicProjectId) {
    const err = new Error(
      "You are in an assessment and cannot switch organisation until it closes.",
    );
    // @ts-ignore
    err.code = "ASSESSMENT_LOCKED";
    throw err;
  }

  const otherInProgress = await findStudentInProgressAttempt(db, userId, {
    excludeAcademicProjectId: academicProjectId,
  });
  if (otherInProgress?.academicProject?.id) {
    const otherName = otherInProgress.academicProject.name || "another project";
    const err = new Error(
      `You already have an active attempt in “${otherName}”. Finish that project before opening another.`,
    );
    // @ts-ignore
    err.code = "PROJECT_IN_PROGRESS";
    throw err;
  }

  const workspace = await findStudentAttemptOrg(db, {
    studentUserId: userId,
    academicProjectId,
  });
  if (!workspace?.id) {
    const err = new Error("Start this project before opening its organisation.");
    // @ts-ignore
    err.code = "NO_WORKSPACE";
    throw err;
  }
  await persistStudentActiveOrg(db, userId, workspace.id);
  const academicProject = await db.project.findUnique({ where: { id: academicProjectId } });
  const kind =
    academicProject?.purpose === ProjectPurpose.ASSESSMENT ? "ASSESSMENT" : "PRACTICE";
  return {
    org: workspace,
    kind,
    locked: kind === "ASSESSMENT",
    academicProject,
  };
}
