/**
 * Automatic assessment — READS real procurement domain state.
 * Does not duplicate workflow / business rules.
 */
import {
  AssessmentCheckpointKind,
  AssessmentGradingMode,
  AttemptGradeStatus,
  ProjectAttemptStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import {
  OBSERVATION_STAGE_KEYS,
  deriveOrganisationProcurementProgress,
} from "@/lib/projects/derive-org-progress";
import { findStudentPersonalOrg } from "@/lib/projects/student-personal-org";
import { orgOpsSlateListWhere } from "@/lib/academic/org-academic-slate";
import { computeFinalScore } from "@/lib/academic/assessment-scoring";

/**
 * @param {any} checkpoint
 * @param {{
 *   progress: Awaited<ReturnType<typeof deriveOrganisationProcurementProgress>> | null;
 *   procurements: { procurementMethod: string | null }[];
 *   attempt: { status: string };
 * }} ctx
 */
export function evaluateCheckpointAgainstDomain(checkpoint, ctx) {
  const kind = String(checkpoint.kind);
  const marks = Math.max(0, Number(checkpoint.marks) || 0);

  if (kind === AssessmentCheckpointKind.ATTEMPT_SUBMITTED) {
    const ok = [
      ProjectAttemptStatus.SUBMITTED,
      ProjectAttemptStatus.UNDER_REVIEW,
      ProjectAttemptStatus.COMPLETED,
    ].includes(ctx.attempt.status);
    return {
      checkpointId: checkpoint.id,
      label: checkpoint.label,
      kind,
      marks,
      satisfied: ok,
      awarded: ok ? marks : 0,
      detail: ok ? "Attempt submitted" : "Attempt not submitted",
    };
  }

  if (kind === AssessmentCheckpointKind.PROCUREMENT_METHOD) {
    const required = String(checkpoint.procurementMethod || "").toUpperCase();
    const hit = (ctx.procurements || []).some(
      (p) => String(p.procurementMethod || "").toUpperCase() === required,
    );
    return {
      checkpointId: checkpoint.id,
      label: checkpoint.label,
      kind,
      marks,
      satisfied: hit,
      awarded: hit ? marks : 0,
      detail: hit
        ? `Procurement method ${required} present`
        : `No procurement with method ${required || "(unset)"}`,
    };
  }

  if (
    kind === AssessmentCheckpointKind.STAGE_COMPLETED ||
    kind === AssessmentCheckpointKind.STAGE_REACHED
  ) {
    const stageKey = String(checkpoint.stageKey || "");
    const stage = ctx.progress?.stages?.find((s) => s.key === stageKey) || null;
    const targetIdx = OBSERVATION_STAGE_KEYS.indexOf(stageKey);
    let satisfied = false;
    let detail = `Stage ${stageKey || "(unset)"} not found`;

    if (stage && targetIdx >= 0) {
      if (kind === AssessmentCheckpointKind.STAGE_COMPLETED) {
        satisfied = stage.state === "done";
        detail = satisfied
          ? `${stage.label} completed`
          : `${stage.label} not completed (${stage.state})`;
      } else {
        const currentIdx = OBSERVATION_STAGE_KEYS.indexOf(
          ctx.progress?.summary?.currentStageKey || "",
        );
        const furthestDone = OBSERVATION_STAGE_KEYS.reduce((acc, key, idx) => {
          const st = ctx.progress?.stages?.find((s) => s.key === key);
          if (st?.state === "done") return Math.max(acc, idx);
          return acc;
        }, -1);
        const furthest = Math.max(furthestDone, currentIdx);
        satisfied = furthest >= targetIdx;
        detail = satisfied
          ? `${stage.label} reached`
          : `${stage.label} not reached yet`;
      }
    }

    return {
      checkpointId: checkpoint.id,
      label: checkpoint.label,
      kind,
      marks,
      stageKey,
      satisfied,
      awarded: satisfied ? marks : 0,
      detail,
    };
  }

  return {
    checkpointId: checkpoint.id,
    label: checkpoint.label,
    kind,
    marks,
    satisfied: false,
    awarded: 0,
    detail: "Unknown checkpoint kind",
  };
}

/**
 * Ensure a ProjectAssessment row exists (optional by default for Practice).
 * @param {import("@prisma/client").PrismaClient} db
 * @param {{ projectId: string; createIfMissing?: boolean }} opts
 */
export async function getOrCreateProjectAssessment(db, opts) {
  const existing = await db.projectAssessment.findUnique({
    where: { projectId: opts.projectId },
    include: { checkpoints: { orderBy: { sortOrder: "asc" } } },
  });
  if (existing) return existing;
  if (!opts.createIfMissing) return null;

  return db.projectAssessment.create({
    data: {
      projectId: opts.projectId,
      gradingMode: AssessmentGradingMode.COMBINED,
      manualMaxMarks: 40,
      passMarkPercent: 50,
      resultsReleased: false,
    },
    include: { checkpoints: { orderBy: { sortOrder: "asc" } } },
  });
}

/**
 * Run automatic evaluation for one attempt against domain state.
 * @param {{
 *   attemptId: string;
 *   actorUserId?: string | null;
 *   db?: import("@prisma/client").PrismaClient;
 * }} opts
 */
export async function autoEvaluateProjectAttempt(opts) {
  const db = opts.db || prisma;
  const attempt = await db.projectAttempt.findUnique({
    where: { id: opts.attemptId },
    include: {
      enrollment: { include: { project: true } },
      grade: true,
    },
  });
  if (!attempt) {
    const err = new Error("Attempt not found.");
    // @ts-ignore
    err.code = "NOT_FOUND";
    throw err;
  }

  const project = attempt.enrollment.project;
  const assessment = await getOrCreateProjectAssessment(db, {
    projectId: project.id,
    createIfMissing: false,
  });
  if (!assessment) {
    return { skipped: true, reason: "No assessment configuration" };
  }

  if (assessment.gradingMode === AssessmentGradingMode.MANUAL) {
    // Keep/create grade shell for manual-only
    const computed = computeFinalScore({
      gradingMode: assessment.gradingMode,
      autoScore: 0,
      manualScore: attempt.grade?.manualScore,
      autoMaxMarks: 0,
      manualMaxMarks: assessment.manualMaxMarks,
      passMarkPercent: assessment.passMarkPercent,
      manualEntered: attempt.grade?.manualScore != null,
    });
    const grade = await db.projectAttemptGrade.upsert({
      where: { attemptId: attempt.id },
      create: {
        attemptId: attempt.id,
        assessmentId: assessment.id,
        autoScore: 0,
        manualScore: attempt.grade?.manualScore ?? null,
        finalScore: computed.status === AttemptGradeStatus.GRADED ? computed.finalScore : null,
        finalPercent:
          computed.status === AttemptGradeStatus.GRADED ? computed.finalPercent : null,
        passFail: computed.passFail,
        status: computed.status,
        feedback: attempt.grade?.feedback ?? null,
        checkpointResults: [],
        autoEvaluatedAt: new Date(),
        gradedByUserId: attempt.grade?.gradedByUserId ?? null,
        gradedAt: attempt.grade?.gradedAt ?? null,
      },
      update: {
        autoScore: 0,
        checkpointResults: [],
        autoEvaluatedAt: new Date(),
        status: computed.status,
        finalScore: computed.status === AttemptGradeStatus.GRADED ? computed.finalScore : null,
        finalPercent:
          computed.status === AttemptGradeStatus.GRADED ? computed.finalPercent : null,
        passFail: computed.passFail,
      },
    });
    return { skipped: false, grade, checkpointResults: [], computed };
  }

  const studentUserId = attempt.enrollment.studentUserId;
  const org = await findStudentPersonalOrg(db, studentUserId);
  let progress = null;
  /** @type {{ procurementMethod: string | null }[]} */
  let procurements = [];
  if (org?.id) {
    progress = await deriveOrganisationProcurementProgress(org.id, { db });
    let slateWhere = {};
    if (attempt.academicSlateId) {
      slateWhere = orgOpsSlateListWhere(attempt.academicSlateId);
    }
    procurements = await db.projectOrgProcurement.findMany({
      where: { projectId: org.id, ...slateWhere },
      select: { procurementMethod: true },
      take: 100,
    });
  }

  const activeCheckpoints = (assessment.checkpoints || []).filter((c) => c.isActive);
  const checkpointResults = activeCheckpoints.map((cp) =>
    evaluateCheckpointAgainstDomain(cp, {
      progress,
      procurements,
      attempt,
    }),
  );
  const autoMaxMarks = activeCheckpoints.reduce((s, c) => s + Math.max(0, c.marks || 0), 0);
  const autoScore = checkpointResults.reduce((s, r) => s + (r.awarded || 0), 0);

  const computed = computeFinalScore({
    gradingMode: assessment.gradingMode,
    autoScore,
    manualScore: attempt.grade?.manualScore,
    autoMaxMarks,
    manualMaxMarks: assessment.manualMaxMarks,
    passMarkPercent: assessment.passMarkPercent,
    manualEntered: attempt.grade?.manualScore != null,
  });

  const grade = await db.projectAttemptGrade.upsert({
    where: { attemptId: attempt.id },
    create: {
      attemptId: attempt.id,
      assessmentId: assessment.id,
      autoScore: computed.autoScore,
      manualScore: attempt.grade?.manualScore ?? null,
      finalScore: computed.finalScore,
      finalPercent: computed.finalPercent,
      passFail: computed.passFail,
      status: computed.status,
      feedback: attempt.grade?.feedback ?? null,
      checkpointResults,
      autoEvaluatedAt: new Date(),
      gradedByUserId:
        computed.status === AttemptGradeStatus.GRADED &&
        assessment.gradingMode === AssessmentGradingMode.AUTOMATIC
          ? opts.actorUserId || null
          : attempt.grade?.gradedByUserId ?? null,
      gradedAt:
        computed.status === AttemptGradeStatus.GRADED &&
        assessment.gradingMode === AssessmentGradingMode.AUTOMATIC
          ? new Date()
          : attempt.grade?.gradedAt ?? null,
    },
    update: {
      autoScore: computed.autoScore,
      finalScore: computed.finalScore,
      finalPercent: computed.finalPercent,
      passFail: computed.passFail,
      status: computed.status,
      checkpointResults,
      autoEvaluatedAt: new Date(),
      ...(computed.status === AttemptGradeStatus.GRADED &&
      assessment.gradingMode === AssessmentGradingMode.AUTOMATIC &&
      !attempt.grade?.gradedAt
        ? {
            gradedAt: new Date(),
            gradedByUserId: opts.actorUserId || null,
          }
        : {}),
    },
  });

  if (
    computed.status === AttemptGradeStatus.GRADED &&
    assessment.gradingMode === AssessmentGradingMode.AUTOMATIC
  ) {
    await db.projectAttempt.update({
      where: { id: attempt.id },
      data: { status: ProjectAttemptStatus.COMPLETED },
    });
  } else if (attempt.status === ProjectAttemptStatus.SUBMITTED) {
    await db.projectAttempt.update({
      where: { id: attempt.id },
      data: { status: ProjectAttemptStatus.UNDER_REVIEW },
    });
  }

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ATTEMPT_AUTO_SCORED,
    actorUserId: opts.actorUserId || studentUserId,
    targetUserId: studentUserId,
    meta: {
      projectId: project.id,
      attemptId: attempt.id,
      assessmentId: assessment.id,
      autoScore: computed.autoScore,
      autoMaxMarks,
      status: computed.status,
      finalScore: computed.finalScore,
      finalPercent: computed.finalPercent,
      passFail: computed.passFail,
      isOfficial: null, // filled by callers that know participation
    },
  });

  return { skipped: false, grade, checkpointResults, computed };
}

/**
 * Examiner manual grade for an attempt.
 * @param {{
 *   attemptId: string;
 *   actorUserId: string;
 *   manualScore: number;
 *   feedback?: string | null;
 *   db?: import("@prisma/client").PrismaClient;
 * }} opts
 */
export async function manualGradeProjectAttempt(opts) {
  const db = opts.db || prisma;
  const attempt = await db.projectAttempt.findUnique({
    where: { id: opts.attemptId },
    include: {
      enrollment: { include: { project: true } },
      grade: true,
    },
  });
  if (!attempt) {
    const err = new Error("Attempt not found.");
    // @ts-ignore
    err.code = "NOT_FOUND";
    throw err;
  }

  const assessment = await getOrCreateProjectAssessment(db, {
    projectId: attempt.enrollment.projectId,
    createIfMissing: false,
  });
  if (!assessment) {
    const err = new Error("Configure assessment scoring before grading.");
    // @ts-ignore
    err.code = "NO_ASSESSMENT";
    throw err;
  }

  if (assessment.gradingMode === AssessmentGradingMode.AUTOMATIC) {
    const err = new Error("This assessment is automatic-only; manual marks are not used.");
    // @ts-ignore
    err.code = "MODE";
    throw err;
  }

  const activeCheckpoints = (assessment.checkpoints || []).filter((c) => c.isActive);
  const autoMaxMarks =
    assessment.gradingMode === AssessmentGradingMode.MANUAL
      ? 0
      : activeCheckpoints.reduce((s, c) => s + Math.max(0, c.marks || 0), 0);

  // Prefer existing auto score; re-run domain eval if none yet and mode uses auto
  let autoScore = attempt.grade?.autoScore ?? 0;
  let checkpointResults = attempt.grade?.checkpointResults ?? [];
  if (
    assessment.gradingMode !== AssessmentGradingMode.MANUAL &&
    (!attempt.grade || attempt.grade.autoEvaluatedAt == null)
  ) {
    const auto = await autoEvaluateProjectAttempt({
      attemptId: attempt.id,
      actorUserId: opts.actorUserId,
      db,
    });
    if (!auto.skipped && auto.computed) {
      autoScore = auto.computed.autoScore;
      checkpointResults = auto.checkpointResults || [];
    }
  }

  const computed = computeFinalScore({
    gradingMode: assessment.gradingMode,
    autoScore,
    manualScore: opts.manualScore,
    autoMaxMarks,
    manualMaxMarks: assessment.manualMaxMarks,
    passMarkPercent: assessment.passMarkPercent,
    manualEntered: true,
  });

  const feedback =
    opts.feedback === undefined
      ? attempt.grade?.feedback ?? null
      : String(opts.feedback || "").trim() || null;

  const grade = await db.projectAttemptGrade.upsert({
    where: { attemptId: attempt.id },
    create: {
      attemptId: attempt.id,
      assessmentId: assessment.id,
      autoScore: computed.autoScore,
      manualScore: computed.manualScore,
      finalScore: computed.finalScore,
      finalPercent: computed.finalPercent,
      passFail: computed.passFail,
      status: AttemptGradeStatus.GRADED,
      feedback,
      checkpointResults,
      gradedByUserId: opts.actorUserId,
      gradedAt: new Date(),
      autoEvaluatedAt: attempt.grade?.autoEvaluatedAt ?? null,
    },
    update: {
      autoScore: computed.autoScore,
      manualScore: computed.manualScore,
      finalScore: computed.finalScore,
      finalPercent: computed.finalPercent,
      passFail: computed.passFail,
      status: AttemptGradeStatus.GRADED,
      feedback,
      gradedByUserId: opts.actorUserId,
      gradedAt: new Date(),
    },
  });

  await db.projectAttempt.update({
    where: { id: attempt.id },
    data: { status: ProjectAttemptStatus.COMPLETED },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ATTEMPT_MANUAL_GRADED,
    actorUserId: opts.actorUserId,
    targetUserId: attempt.enrollment.studentUserId,
    meta: {
      projectId: attempt.enrollment.projectId,
      attemptId: attempt.id,
      assessmentId: assessment.id,
      autoScore: computed.autoScore,
      manualScore: computed.manualScore,
      finalScore: computed.finalScore,
      finalPercent: computed.finalPercent,
      passFail: computed.passFail,
      feedbackLength: feedback ? feedback.length : 0,
    },
  });

  return { grade, computed };
}
