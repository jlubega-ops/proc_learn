/**
 * Academic ProjectAttempt lifecycle — enrollment is membership; attempt is execution.
 * Timer is server-authoritative (startedAt + Project.durationSeconds).
 * Procurement work happens on the student's My Organisation; progress is observed from domain.
 */
import {
  ProjectAttemptStatus,
  ProjectEnrollmentStatus,
  ProjectPurpose,
  Role,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { findStudentPersonalOrg, ensureStudentPersonalOrg } from "@/lib/projects/student-personal-org";
import { ensureCurrentOrgSlateForOwner } from "@/lib/academic/org-academic-slate";
import { getActiveEnrollment } from "@/lib/academic/student-enrollment";
import { deriveOrganisationProcurementProgress } from "@/lib/projects/derive-org-progress";
import { OBSERVATION_STAGE_LABELS } from "@/lib/projects/derive-org-progress";

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
    if (timer && timer.remainingSeconds === 0 && timer.durationSeconds != null) {
      return { key: "in_progress", label: "Time expired — submit" };
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
 * Server-authoritative timer snapshot for an in-progress attempt.
 * @param {{ attempt: any; project: any; now?: Date }} p
 */
export function computeAttemptTimer({ attempt, project, now = new Date() }) {
  const durationSeconds =
    typeof project?.durationSeconds === "number" && project.durationSeconds > 0
      ? project.durationSeconds
      : null;

  if (!attempt?.startedAt || durationSeconds == null) {
    return {
      durationSeconds,
      elapsedSeconds: attempt?.durationSecondsUsed || 0,
      remainingSeconds: durationSeconds,
      expired: false,
      serverNow: now.toISOString(),
      deadlineAt: null,
    };
  }

  const startedAt = new Date(attempt.startedAt);
  const elapsed = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
  const remaining = Math.max(0, durationSeconds - elapsed);
  const deadlineAt = new Date(startedAt.getTime() + durationSeconds * 1000);

  return {
    durationSeconds,
    elapsedSeconds: elapsed,
    remainingSeconds: remaining,
    expired: remaining === 0,
    serverNow: now.toISOString(),
    deadlineAt: deadlineAt.toISOString(),
  };
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
 * Start a new ProjectAttempt (or resume NOT_STARTED). Binds current personal-org slate.
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
  if (!project || project.isPersonalOrg) {
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
    const progress = await refreshAttemptProgressCache(db, active, opts.studentUserId);
    return {
      attempt: serializeAttempt(progress || active),
      enrollment,
      project,
      timer,
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

  // Personal org + current academic slate (never create a new organisation)
  await ensureStudentPersonalOrg(db, opts.studentUserId);
  const personalOrg = await findStudentPersonalOrg(db, opts.studentUserId);
  if (!personalOrg?.id) {
    const err = new Error("My Organisation is required before starting.");
    // @ts-ignore
    err.code = "NO_ORG";
    throw err;
  }
  const slateResult = await ensureCurrentOrgSlateForOwner(db, opts.studentUserId);
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
      },
    });
  }

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
      personalOrgProjectId: personalOrg.id,
      purpose: project.purpose,
    },
  });

  const timer = computeAttemptTimer({ attempt, project, now });
  return {
    attempt: serializeAttempt(attempt),
    enrollment,
    project,
    timer,
    personalOrgProjectId: personalOrg.id,
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
export async function submitProjectAttempt(opts) {
  const db = opts.db || prisma;
  const attempt = await db.projectAttempt.findUnique({
    where: { id: opts.attemptId },
    include: { enrollment: { include: { project: true } } },
  });
  if (!attempt || attempt.enrollment.studentUserId !== opts.studentUserId) {
    const err = new Error("Attempt not found.");
    // @ts-ignore
    err.code = "NOT_FOUND";
    throw err;
  }

  const project = attempt.enrollment.project;
  const now = new Date();

  if (
    attempt.status === ProjectAttemptStatus.SUBMITTED ||
    attempt.status === ProjectAttemptStatus.COMPLETED ||
    attempt.status === ProjectAttemptStatus.UNDER_REVIEW
  ) {
    if (!project.allowEditAfterSubmit) {
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
  const used = timer.durationSeconds != null ? timer.elapsedSeconds : attempt.durationSecondsUsed;

  // Refresh progress cache from personal org before locking
  await refreshAttemptProgressCache(db, attempt, opts.studentUserId);

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
    actorUserId: opts.actorUserId || opts.studentUserId,
    targetUserId: opts.studentUserId,
    meta: {
      projectId: project.id,
      enrollmentId: attempt.enrollmentId,
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      autoExpired: Boolean(opts.autoExpired),
      durationSecondsUsed: used,
      purpose: project.purpose,
    },
  });

  // Phase 9: when assessment config exists, auto-evaluate from real domain state.
  // Phase 10: never return grade scores to the student until results are released.
  try {
    const { autoEvaluateProjectAttempt } = await import("@/lib/academic/assessment-evaluate");
    await autoEvaluateProjectAttempt({
      attemptId: attempt.id,
      actorUserId: opts.actorUserId || opts.studentUserId,
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
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} db
 * @param {any} attempt
 * @param {string} studentUserId
 */
async function refreshAttemptProgressCache(db, attempt, studentUserId) {
  try {
    const org = await findStudentPersonalOrg(db, studentUserId);
    if (!org?.id) return null;
    const progress = await deriveOrganisationProcurementProgress(org.id, { db });
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

  const projects = await db.project.findMany({
    where: {
      isPersonalOrg: false,
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
    const timer = latestAttempt
      ? computeAttemptTimer({ attempt: latestAttempt, project })
      : null;
    const status = humanAcademicProjectStatus({
      project,
      enrollment,
      latestAttempt,
      timer,
    });
    return {
      id: project.id,
      name: project.name,
      description: project.description,
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
      href:
        purpose === ProjectPurpose.ASSESSMENT
          ? `/academic/assessments/${project.id}`
          : `/academic/practice/${project.id}`,
    };
  });
}

/**
 * Examiner participant snapshot for one academic project.
 * @param {{ projectId: string; db?: import("@prisma/client").PrismaClient }} opts
 */
export async function listAcademicProjectParticipants(opts) {
  const db = opts.db || prisma;
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
      attempts: { orderBy: { attemptNumber: "desc" } },
    },
    orderBy: { enrolledAt: "desc" },
    take: 200,
  });

  const participants = enrollments.map((e) => {
    const latest = e.attempts[0] || null;
    const timer = latest ? computeAttemptTimer({ attempt: latest, project }) : null;
    const status = humanAcademicProjectStatus({
      project,
      enrollment: e,
      latestAttempt: latest,
      timer,
    });
    const participationType = e.student.academicEnrollments?.[0]?.participationType || "STUDENT";
    const stageKey = latest?.currentStageKey ?? null;
    return {
      enrollmentId: e.id,
      studentUserId: e.studentUserId,
      displayName: [e.student.firstName, e.student.lastName].filter(Boolean).join(" "),
      email: e.student.email,
      studentNumber: e.student.studentProfile?.studentNumber || null,
      programme: e.student.studentProfile?.programme?.shortName || null,
      participationType,
      enrolledAt: e.enrolledAt,
      attemptCount: e.attempts.length,
      latestAttempt: serializeAttempt(latest),
      timer,
      status,
      progressPercent: latest?.progressPercent ?? null,
      currentStageKey: stageKey,
      currentStageLabel: stageKey
        ? OBSERVATION_STAGE_LABELS[stageKey] || stageKey
        : null,
    };
  });

  const counts = {
    enrolled: participants.length,
    notStarted: participants.filter((p) => p.status.key === "not_started").length,
    inProgress: participants.filter((p) => p.status.key === "in_progress").length,
    submitted: participants.filter((p) => p.status.key === "submitted").length,
    completed: participants.filter((p) => p.status.key === "completed").length,
  };

  return { project, participants, counts };
}

export { ProjectAttemptStatus, ProjectPurpose };
