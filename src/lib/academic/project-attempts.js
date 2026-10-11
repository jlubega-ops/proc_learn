/**
 * Academic ProjectAttempt lifecycle — enrollment is membership; attempt is execution.
 * Timer is server-authoritative:
 *   - Duration (H:MM) → countdown from startedAt; does not pause on logout
 *   - No duration → countdown to project closeAt
 *   - When both apply after start → earlier deadline wins
 * Each student works in an isolated organisation shell for this academic project.
 */
import {
  ProjectAttemptStatus,
  ProjectEnrollmentStatus,
  ProjectPurpose,
  Role,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { findStudentPersonalOrg } from "@/lib/projects/student-personal-org";
import { ensureStudentAttemptOrganisation } from "@/lib/projects/student-attempt-org";
import {
  findStudentAssessmentLock,
  findStudentInProgressAttempt,
  persistStudentActiveOrg,
} from "@/lib/projects/student-active-org";
import { ensureCurrentOrgSlateForProject } from "@/lib/academic/org-academic-slate";
import { getActiveEnrollment } from "@/lib/academic/student-enrollment";
import { campusLabel } from "@/lib/campuses";
import {
  isProjectMeantForStudent,
  loadStudentEligibilityContext,
  studentVisibleAcademicProjectWhere,
} from "@/lib/academic/student-project-eligibility";
import { deriveOrganisationProcurementProgress } from "@/lib/projects/derive-org-progress";
import { OBSERVATION_STAGE_LABELS } from "@/lib/projects/derive-org-progress";
import { getOrCreateProjectAssessment, computeLiveProcessScore } from "@/lib/academic/assessment-evaluate";

export { formatDurationClock, formatDurationHuman } from "@/lib/academic/attempt-timer-format";
import { computeAttemptTimer } from "@/lib/academic/attempt-timer";
export { computeAttemptTimer };

/**
 * @param {any} project
 */
export function isAcademicProjectWindowOpen(project, now = new Date()) {
  const t = now.getTime();
  if (project?.openAt && new Date(project.openAt).getTime() > t) return false;
  if (project?.closeAt && new Date(project.closeAt).getTime() < t) return false;
  return true;
}

/**
 * @param {any} project
 * @param {Date} [now]
 */
export function academicProjectAvailability(project, now = new Date()) {
  const t = now.getTime();
  if (!project?.isPublished) return { key: "unpublished", label: "Not published" };
  if (project.closeAt && new Date(project.closeAt).getTime() < t) {
    return { key: "closed", label: "Closed" };
  }
  if (project.openAt && new Date(project.openAt).getTime() > t) {
    return { key: "upcoming", label: "Available soon" };
  }
  return { key: "available", label: "Available" };
}

/**
 * Human status for a student's participation in an academic project.
 * @param {{ project: any; enrollment: any; latestAttempt: any; timer?: any }} p
 */
export function humanAcademicProjectStatus({ project, enrollment, latestAttempt, timer }) {
  const avail = academicProjectAvailability(project);
  if (avail.key === "closed" && !latestAttempt) return { key: "closed", label: "Closed" };
  if (!enrollment) {
    if (avail.key === "upcoming") return { key: "available", label: "Available soon" };
    if (avail.key === "available") return { key: "not_started", label: "Not started" };
    return { key: avail.key, label: avail.label };
  }
  if (!latestAttempt || latestAttempt.status === ProjectAttemptStatus.NOT_STARTED) {
    return { key: "not_started", label: "Not started" };
  }
  if (latestAttempt.status === ProjectAttemptStatus.IN_PROGRESS) {
    if (timer?.expired) {
      return { key: "in_progress", label: "Time expired — submitting" };
    }
    return { key: "in_progress", label: "In progress" };
  }
  if (latestAttempt.status === ProjectAttemptStatus.SUBMITTED) {
    return { key: "submitted", label: "Submitted" };
  }
  if (latestAttempt.status === ProjectAttemptStatus.COMPLETED) {
    return { key: "completed", label: "Completed" };
  }
  if (latestAttempt.status === ProjectAttemptStatus.UNDER_REVIEW) {
    return { key: "submitted", label: "Under review" };
  }
  if (latestAttempt.status === ProjectAttemptStatus.RETURNED) {
    return { key: "in_progress", label: "Returned" };
  }
  return { key: "not_started", label: "Not started" };
}

/**
 * Auto-submit an in-progress attempt when the server timer has expired.
 * @param {{
 *   attemptId: string;
 *   studentUserId: string;
 *   actorUserId?: string | null;
 *   db?: import("@prisma/client").PrismaClient;
 * }} opts
 */
export async function autoSubmitIfAttemptExpired(opts) {
  const db = opts.db || prisma;
  const attempt = await db.projectAttempt.findUnique({
    where: { id: opts.attemptId },
    include: { enrollment: { include: { project: true } } },
  });
  if (!attempt || attempt.enrollment.studentUserId !== opts.studentUserId) {
    return null;
  }
  if (
    attempt.status !== ProjectAttemptStatus.IN_PROGRESS &&
    attempt.status !== ProjectAttemptStatus.RETURNED
  ) {
    return null;
  }
  const timer = computeAttemptTimer({
    attempt,
    project: attempt.enrollment.project,
  });
  if (!timer.expired) return null;
  return submitProjectAttempt({
    attemptId: attempt.id,
    studentUserId: opts.studentUserId,
    actorUserId: opts.actorUserId || opts.studentUserId,
    autoExpired: true,
    db,
  });
}

/**
 * @param {any} attempt
 */
export function serializeAttempt(attempt) {
  if (!attempt) return null;
  return {
    id: attempt.id,
    enrollmentId: attempt.enrollmentId,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    durationSecondsUsed: attempt.durationSecondsUsed,
    progressPercent: attempt.progressPercent,
    currentStageKey: attempt.currentStageKey,
    academicSlateId: attempt.academicSlateId,
    studentAcademicEnrollmentId: attempt.studentAcademicEnrollmentId,
    workspaceProjectId: attempt.workspaceProjectId || null,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
  };
}

/**
 * Ensure ProjectEnrollment exists (membership only).
 * @param {import("@prisma/client").PrismaClient} db
 * @param {{ projectId: string; studentUserId: string }} p
 */
export async function ensureProjectEnrollment(db, { projectId, studentUserId }) {
  return db.projectEnrollment.upsert({
    where: { projectId_studentUserId: { projectId, studentUserId } },
    create: { projectId, studentUserId },
    update: {},
  });
}

/**
 * Start a new ProjectAttempt (or resume NOT_STARTED / IN_PROGRESS).
 * Creates an isolated organisation shell (same name as the examiner specified).
 * @param {{
 *   projectId: string;
 *   studentUserId: string;
 *   actorUserId?: string;
 *   db?: import("@prisma/client").PrismaClient;
 * }} opts
 */
export async function startProjectAttempt(opts) {
  const db = opts.db || prisma;
  const project = await db.project.findUnique({ where: { id: opts.projectId } });
  if (!project || project.isPersonalOrg || project.isAttemptOrg) {
    const err = new Error("Academic project not found.");
    // @ts-ignore
    err.code = "NOT_FOUND";
    throw err;
  }
  if (project.creatorRole !== Role.EXAMINER || !project.requiresEnrollment) {
    const err = new Error("This project does not support academic attempts.");
    // @ts-ignore
    err.code = "NOT_ACADEMIC";
    throw err;
  }
  if (!project.isPublished) {
    const err = new Error("This project is not published.");
    // @ts-ignore
    err.code = "NOT_PUBLISHED";
    throw err;
  }
  if (!isAcademicProjectWindowOpen(project)) {
    const err = new Error("This project is not open right now.");
    // @ts-ignore
    err.code = "WINDOW_CLOSED";
    throw err;
  }
  const alreadyJoined = await db.projectEnrollment.findUnique({
    where: {
      projectId_studentUserId: { projectId: opts.projectId, studentUserId: opts.studentUserId },
    },
    select: { id: true },
  });
  if (
    !alreadyJoined &&
    !(await isProjectMeantForStudent(db, {
      projectId: opts.projectId,
      studentUserId: opts.studentUserId,
    }))
  ) {
    const err = new Error("This project is not for your class.");
    // @ts-ignore
    err.code = "NOT_ELIGIBLE";
    throw err;
  }

  const otherInProgress = await findStudentInProgressAttempt(db, opts.studentUserId, {
    excludeAcademicProjectId: opts.projectId,
  });
  if (otherInProgress?.academicProject?.id) {
    const otherName = otherInProgress.academicProject.name || "another project";
    const err = new Error(
      `You already have an active attempt in “${otherName}”. Finish or leave that project before starting another.`,
    );
    // @ts-ignore
    err.code = "PROJECT_IN_PROGRESS";
    throw err;
  }

  const otherLock = await findStudentAssessmentLock(db, opts.studentUserId);
  if (otherLock?.academicProject?.id && otherLock.academicProject.id !== opts.projectId) {
    const err = new Error(
      "You are already in an assessment organisation and cannot start another project until it closes.",
    );
    // @ts-ignore
    err.code = "ASSESSMENT_LOCKED";
    throw err;
  }

  const enrollment = await ensureProjectEnrollment(db, {
    projectId: opts.projectId,
    studentUserId: opts.studentUserId,
  });

  const existingAttempts = await db.projectAttempt.findMany({
    where: { enrollmentId: enrollment.id },
    orderBy: { attemptNumber: "desc" },
  });

  const active = existingAttempts.find(
    (a) =>
      a.status === ProjectAttemptStatus.IN_PROGRESS ||
      a.status === ProjectAttemptStatus.NOT_STARTED ||
      a.status === ProjectAttemptStatus.RETURNED,
  );
  if (active && active.status === ProjectAttemptStatus.IN_PROGRESS) {
    const timer = computeAttemptTimer({ attempt: active, project });
    if (timer.expired) {
      // Time is up — auto-submit
      return submitProjectAttempt({
        attemptId: active.id,
        studentUserId: opts.studentUserId,
        actorUserId: opts.actorUserId,
        autoExpired: true,
        db,
      });
    }
    const workspace = await resumeAttemptWorkspace(db, {
      studentUserId: opts.studentUserId,
      academicProject: project,
      attempt: active,
    });
    const progress = await refreshAttemptProgressCache(db, active, opts.studentUserId);
    return {
      attempt: serializeAttempt(progress || active),
      enrollment,
      project,
      timer,
      workspaceProjectId: workspace?.id || null,
      resumed: true,
    };
  }

  const submittedCount = existingAttempts.filter((a) =>
    [
      ProjectAttemptStatus.SUBMITTED,
      ProjectAttemptStatus.UNDER_REVIEW,
      ProjectAttemptStatus.COMPLETED,
    ].includes(a.status),
  ).length;

  const maxAttempts = project.maxAttempts;
  if (typeof maxAttempts === "number" && maxAttempts > 0 && submittedCount >= maxAttempts) {
    if (!project.allowEditAfterSubmit) {
      const err = new Error("No attempts remaining for this project.");
      // @ts-ignore
      err.code = "MAX_ATTEMPTS";
      throw err;
    }
  }

  const workspace = await ensureStudentAttemptOrganisation(db, {
    studentUserId: opts.studentUserId,
    academicProject: project,
  });
  if (!workspace?.id) {
    const err = new Error("Could not open the organisation workspace for this project.");
    // @ts-ignore
    err.code = "NO_ORG";
    throw err;
  }
  const slateResult = await ensureCurrentOrgSlateForProject(
    db,
    workspace.id,
    opts.studentUserId,
  );
  const academicEnrollment = await getActiveEnrollment(db, opts.studentUserId);

  const nextNumber =
    existingAttempts.length > 0 ? existingAttempts[0].attemptNumber + 1 : 1;

  if (typeof maxAttempts === "number" && maxAttempts > 0 && nextNumber > maxAttempts) {
    const err = new Error("No attempts remaining for this project.");
    // @ts-ignore
    err.code = "MAX_ATTEMPTS";
    throw err;
  }

  const now = new Date();
  let attempt;
  if (active && active.status === ProjectAttemptStatus.NOT_STARTED) {
    attempt = await db.projectAttempt.update({
      where: { id: active.id },
      data: {
        status: ProjectAttemptStatus.IN_PROGRESS,
        startedAt: now,
        academicSlateId: slateResult?.slate?.id || null,
        studentAcademicEnrollmentId: academicEnrollment?.id || null,
        workspaceProjectId: workspace.id,
      },
    });
  } else {
    attempt = await db.projectAttempt.create({
      data: {
        enrollmentId: enrollment.id,
        attemptNumber: nextNumber,
        status: ProjectAttemptStatus.IN_PROGRESS,
        startedAt: now,
        academicSlateId: slateResult?.slate?.id || null,
        studentAcademicEnrollmentId: academicEnrollment?.id || null,
        workspaceProjectId: workspace.id,
      },
    });
  }

  await persistStudentActiveOrg(db, opts.studentUserId, workspace.id);

  await db.projectEnrollment.update({
    where: { id: enrollment.id },
    data: {
      status: ProjectEnrollmentStatus.IN_PROGRESS,
      startedAt: enrollment.startedAt || now,
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ATTEMPT_STARTED,
    actorUserId: opts.actorUserId || opts.studentUserId,
    targetUserId: opts.studentUserId,
    meta: {
      projectId: opts.projectId,
      enrollmentId: enrollment.id,
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      academicSlateId: attempt.academicSlateId,
      studentAcademicEnrollmentId: attempt.studentAcademicEnrollmentId,
      workspaceProjectId: workspace.id,
      purpose: project.purpose,
    },
  });

  const timer = computeAttemptTimer({ attempt, project, now });
  return {
    attempt: serializeAttempt(attempt),
    enrollment,
    project,
    timer,
    workspaceProjectId: workspace.id,
    resumed: false,
  };
}

/**
 * @param {{
 *   attemptId: string;
 *   studentUserId: string;
 *   actorUserId?: string;
 *   autoExpired?: boolean;
 *   db?: import("@prisma/client").PrismaClient;
 * }} opts
 */
/**
 * Submit a ProjectAttempt (student or staff force-submit).
 * @param {{
 *   attemptId: string;
 *   studentUserId: string;
 *   actorUserId?: string;
 *   autoExpired?: boolean;
 *   forceByStaff?: boolean;
 *   submittedBy?: { type: "org_user" | "provider"; id: string; name?: string | null } | null;
 *   db?: import("@prisma/client").PrismaClient;
 * }} opts
 */
export async function submitProjectAttempt(opts) {
  const db = opts.db || prisma;
  const attempt = await db.projectAttempt.findUnique({
    where: { id: opts.attemptId },
    include: { enrollment: { include: { project: true } } },
  });
  if (!attempt) {
    const err = new Error("Attempt not found.");
    // @ts-ignore
    err.code = "NOT_FOUND";
    throw err;
  }
  const forceByStaff = Boolean(opts.forceByStaff);
  if (!forceByStaff && attempt.enrollment.studentUserId !== opts.studentUserId) {
    const err = new Error("Attempt not found.");
    // @ts-ignore
    err.code = "NOT_FOUND";
    throw err;
  }

  const studentUserId = attempt.enrollment.studentUserId;
  const project = attempt.enrollment.project;
  const now = new Date();

  if (
    attempt.status === ProjectAttemptStatus.SUBMITTED ||
    attempt.status === ProjectAttemptStatus.COMPLETED ||
    attempt.status === ProjectAttemptStatus.UNDER_REVIEW
  ) {
    if (!project.allowEditAfterSubmit && !forceByStaff) {
      return {
        attempt: serializeAttempt(attempt),
        alreadySubmitted: true,
        timer: computeAttemptTimer({ attempt, project, now }),
      };
    }
    if (forceByStaff && !project.allowEditAfterSubmit) {
      // Already submitted — re-run scoring only
      try {
        const { autoEvaluateProjectAttempt } = await import("@/lib/academic/assessment-evaluate");
        await autoEvaluateProjectAttempt({
          attemptId: attempt.id,
          actorUserId: opts.actorUserId || studentUserId,
          db,
        });
      } catch {
        /* keep existing submission */
      }
      return {
        attempt: serializeAttempt(attempt),
        alreadySubmitted: true,
        timer: computeAttemptTimer({ attempt, project, now }),
      };
    }
  }

  if (
    attempt.status !== ProjectAttemptStatus.IN_PROGRESS &&
    attempt.status !== ProjectAttemptStatus.RETURNED &&
    !(project.allowEditAfterSubmit && attempt.status === ProjectAttemptStatus.SUBMITTED)
  ) {
    const err = new Error("This attempt cannot be submitted in its current state.");
    // @ts-ignore
    err.code = "INVALID_STATE";
    throw err;
  }

  const timer = computeAttemptTimer({ attempt, project, now });
  const used = timer.elapsedSeconds;

  await refreshAttemptProgressCache(db, attempt, studentUserId);

  const updated = await db.projectAttempt.update({
    where: { id: attempt.id },
    data: {
      status: ProjectAttemptStatus.SUBMITTED,
      submittedAt: now,
      durationSecondsUsed: used,
    },
  });

  await db.projectEnrollment.update({
    where: { id: attempt.enrollmentId },
    data: {
      status: ProjectEnrollmentStatus.SUBMITTED,
      submittedAt: now,
      startedAt: attempt.enrollment.startedAt || attempt.startedAt || now,
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ATTEMPT_SUBMITTED,
    actorUserId: opts.actorUserId || studentUserId,
    targetUserId: studentUserId,
    meta: {
      projectId: project.id,
      enrollmentId: attempt.enrollmentId,
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      autoExpired: Boolean(opts.autoExpired),
      forceByStaff,
      submittedBy: opts.submittedBy || null,
      durationSecondsUsed: used,
      purpose: project.purpose,
    },
  });

  try {
    const { autoEvaluateProjectAttempt } = await import("@/lib/academic/assessment-evaluate");
    await autoEvaluateProjectAttempt({
      attemptId: attempt.id,
      actorUserId: opts.actorUserId || studentUserId,
      db,
    });
  } catch {
    // Submission remains valid even if scoring config/eval fails.
  }

  return {
    attempt: serializeAttempt(updated),
    alreadySubmitted: false,
    timer: { ...timer, remainingSeconds: 0, expired: timer.expired },
    autoExpired: Boolean(opts.autoExpired),
    forceByStaff,
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} db
 * @param {any} attempt
 * @param {string} studentUserId
 */
async function refreshAttemptProgressCache(db, attempt, studentUserId) {
  try {
    const personal = await findStudentPersonalOrg(db, studentUserId);
    let workspaceId = attempt.workspaceProjectId || null;
    if (!workspaceId && attempt.enrollmentId) {
      const enrollment = attempt.enrollment?.projectId
        ? attempt.enrollment
        : await db.projectEnrollment.findUnique({
            where: { id: attempt.enrollmentId },
            select: { projectId: true },
          });
      if (enrollment?.projectId) {
        const ws = await db.project.findFirst({
          where: {
            ownerUserId: studentUserId,
            isAttemptOrg: true,
            sourceAcademicProjectId: enrollment.projectId,
          },
          select: { id: true },
        });
        workspaceId = ws?.id || null;
      }
    }
    const orgId = workspaceId || personal?.id;
    if (!orgId) return null;
    const progress = await deriveOrganisationProcurementProgress(orgId, { db });
    return db.projectAttempt.update({
      where: { id: attempt.id },
      data: {
        progressPercent: progress.summary.percent,
        currentStageKey: progress.summary.currentStageKey,
        durationSecondsUsed:
          attempt.status === ProjectAttemptStatus.IN_PROGRESS && attempt.startedAt
            ? Math.max(
                0,
                Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000),
              )
            : attempt.durationSecondsUsed,
      },
    });
  } catch {
    return null;
  }
}

/**
 * Resume: switch into an existing attempt workspace. Do not create a new empty
 * shell for legacy attempts that still run on My Organisation.
 * @param {import("@prisma/client").PrismaClient} db
 * @param {{ studentUserId: string; academicProject: any; attempt: any }} p
 */
async function resumeAttemptWorkspace(db, { studentUserId, academicProject, attempt }) {
  let workspace = null;
  if (attempt?.workspaceProjectId) {
    workspace = await db.project.findFirst({
      where: { id: attempt.workspaceProjectId, ownerUserId: studentUserId },
      select: {
        id: true,
        name: true,
        organizationName: true,
        projectCode: true,
        isAttemptOrg: true,
        sourceAcademicProjectId: true,
      },
    });
  }
  if (!workspace) {
    workspace = await db.project.findFirst({
      where: {
        ownerUserId: studentUserId,
        isAttemptOrg: true,
        sourceAcademicProjectId: academicProject.id,
      },
      select: {
        id: true,
        name: true,
        organizationName: true,
        projectCode: true,
        isAttemptOrg: true,
        sourceAcademicProjectId: true,
      },
    });
  }
  if (workspace?.id) {
    if (attempt?.id && attempt.workspaceProjectId !== workspace.id) {
      await db.projectAttempt.update({
        where: { id: attempt.id },
        data: { workspaceProjectId: workspace.id },
      });
      attempt.workspaceProjectId = workspace.id;
    }
    await persistStudentActiveOrg(db, studentUserId, workspace.id);
  }
  return workspace;
}

/**
 * Student catalog for Practice / Assessments.
 * @param {{
 *   studentUserId: string;
 *   purpose: import("@prisma/client").ProjectPurpose;
 *   db?: import("@prisma/client").PrismaClient;
 * }} opts
 */
export async function listStudentAcademicProjects(opts) {
  const db = opts.db || prisma;
  const purpose = opts.purpose;
  const eligibility = await loadStudentEligibilityContext(db, opts.studentUserId);

  const projects = await db.project.findMany({
    where: {
      ...studentVisibleAcademicProjectWhere(eligibility),
      isPersonalOrg: false,
      isAttemptOrg: false,
      creatorRole: Role.EXAMINER,
      requiresEnrollment: true,
      isPublished: true,
      purpose,
      visibility: "PUBLIC",
    },
    orderBy: [{ closeAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  const enrollments = await db.projectEnrollment.findMany({
    where: {
      studentUserId: opts.studentUserId,
      projectId: { in: projects.map((p) => p.id) },
    },
    include: {
      attempts: { orderBy: { attemptNumber: "desc" } },
    },
  });
  const byProject = new Map(enrollments.map((e) => [e.projectId, e]));

  return projects.map((project) => {
    const enrollment = byProject.get(project.id) || null;
    const latestAttempt = enrollment?.attempts?.[0] || null;
    const timer = computeAttemptTimer({
      attempt: latestAttempt,
      project,
    });
    const status = humanAcademicProjectStatus({
      project,
      enrollment,
      latestAttempt,
      timer,
    });
    const canEnroll = academicProjectAvailability(project).key === "available";
    return {
      id: project.id,
      name: project.name,
      organizationName: project.organizationName,
      description: project.description,
      instructions: project.instructions || null,
      questionText: project.questionText || null,
      questionFileUrl: project.questionFileUrl || null,
      purpose: project.purpose,
      openAt: project.openAt,
      closeAt: project.closeAt,
      durationSeconds: project.durationSeconds,
      maxAttempts: project.maxAttempts,
      allowEditAfterSubmit: project.allowEditAfterSubmit,
      enrollmentKeyRequired: Boolean(project.enrollmentKey),
      enrolled: Boolean(enrollment),
      enrollmentId: enrollment?.id || null,
      attemptCount: enrollment?.attempts?.length || 0,
      latestAttempt: serializeAttempt(latestAttempt),
      timer,
      status,
      canEnroll,
      href:
        purpose === ProjectPurpose.ASSESSMENT
          ? `/academic/assessments/${project.id}`
          : `/academic/practice/${project.id}`,
    };
  });
}

/**
 * Examiner participant snapshot for one academic project.
 * @param {{
 *   projectId: string;
 *   db?: import("@prisma/client").PrismaClient;
 *   take?: number;
 * }} opts
 */
export async function listAcademicProjectParticipants(opts) {
  const db = opts.db || prisma;
  const take = Math.min(5000, Math.max(1, Number(opts.take) || 200));
  const project = await db.project.findUnique({ where: { id: opts.projectId } });
  if (!project) return null;

  const enrollments = await db.projectEnrollment.findMany({
    where: { projectId: opts.projectId },
    include: {
      student: {
        include: {
          studentProfile: { include: { programme: true } },
          academicEnrollments: {
            where: { status: "ACTIVE" },
            take: 1,
            include: { academicYear: true },
          },
        },
      },
      attempts: {
        orderBy: { attemptNumber: "desc" },
        include: { grade: true },
      },
    },
    orderBy: { enrolledAt: "desc" },
    take,
  });

  const assessment = await getOrCreateProjectAssessment(db, {
    projectId: opts.projectId,
    createIfMissing: true,
  });

  const liveScores = await Promise.all(
    enrollments.map(async (e) => {
      const latest = e.attempts[0] || null;
      const orgId = latest?.workspaceProjectId || null;
      if (!orgId || !assessment) return null;
      try {
        return await computeLiveProcessScore(db, {
          orgId,
          assessment,
          academicSlateId: latest.academicSlateId || null,
        });
      } catch {
        return null;
      }
    }),
  );

  const participants = enrollments.map((e, index) => {
    const latest = e.attempts[0] || null;
    const timer = latest ? computeAttemptTimer({ attempt: latest, project }) : null;
    const status = humanAcademicProjectStatus({
      project,
      enrollment: e,
      latestAttempt: latest,
      timer,
    });
    const participationType = e.student.academicEnrollments?.[0]?.participationType || "STUDENT";
    const live = liveScores[index];
    const stageKey = live?.currentStageKey || latest?.currentStageKey || null;
    const grade = latest?.grade || null;
    const submitted = Boolean(latest?.submittedAt);
    const livePercent = live?.finalPercent ?? null;
    const storedPercent = grade?.finalPercent ?? null;
    return {
      enrollmentId: e.id,
      studentUserId: e.studentUserId,
      displayName: [e.student.firstName, e.student.lastName].filter(Boolean).join(" "),
      email: e.student.email,
      studentNumber: e.student.studentProfile?.studentNumber || null,
      programme: e.student.studentProfile?.programme?.shortName || null,
      campus: e.student.studentProfile?.campus || null,
      campusLabel: campusLabel(e.student.studentProfile?.campus) || null,
      academicYearLabel: e.student.academicEnrollments?.[0]?.academicYear?.label || null,
      participationType,
      enrolledAt: e.enrolledAt,
      attemptCount: e.attempts.length,
      latestAttempt: serializeAttempt(latest),
      workspaceProjectId: latest?.workspaceProjectId || null,
      timer,
      status,
      progressPercent: live?.progressPercent ?? latest?.progressPercent ?? null,
      currentStageKey: stageKey,
      currentStageLabel: live?.currentStageLabel || (stageKey
        ? OBSERVATION_STAGE_LABELS[stageKey] || stageKey
        : null),
      marks:
        livePercent != null || storedPercent != null
          ? {
              finalScore: live?.finalScore ?? grade?.finalScore,
              finalPercent: livePercent ?? storedPercent,
              totalMarks: live?.totalMarks || assessment?.totalMarks || null,
              status: grade?.status || null,
              live: livePercent != null,
              completedCount: live?.completedCount ?? null,
              allowedCount: live?.allowedCount ?? null,
            }
          : submitted && grade
            ? {
                finalScore: grade.finalScore,
                finalPercent: grade.finalPercent,
                status: grade.status,
              }
            : null,
      processScores: live?.processes || null,
    };
  });

  const counts = {
    enrolled: participants.length,
    notStarted: participants.filter((p) => p.status.key === "not_started").length,
    inProgress: participants.filter((p) => p.status.key === "in_progress").length,
    submitted: participants.filter((p) => p.status.key === "submitted").length,
    completed: participants.filter((p) => p.status.key === "completed").length,
  };

  return {
    project,
    participants,
    counts,
    scoring: assessment
      ? {
          totalMarks: assessment.totalMarks || 100,
          passMarkPercent: assessment.passMarkPercent || 50,
          resultsReleased: Boolean(assessment.resultsReleased),
          resultsView: assessment.resultsView || "SUMMARY",
        }
      : null,
  };
}

export { ProjectAttemptStatus, ProjectPurpose };
