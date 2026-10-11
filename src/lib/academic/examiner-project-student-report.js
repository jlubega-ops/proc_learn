import { prisma } from "@/lib/prisma";
import { resolveParticipantWorkspace } from "@/lib/academic/participant-workspace";
import { getExaminerStudentObservation } from "@/lib/academic/examiner-observation";
import {
  computeAttemptTimer,
  humanAcademicProjectStatus,
  serializeAttempt,
} from "@/lib/academic/project-attempts";
import { getOrCreateProjectAssessment, computeLiveProcessScore } from "@/lib/academic/assessment-evaluate";
import { OBSERVATION_STAGE_LABELS } from "@/lib/projects/derive-org-progress";

/**
 * Full examiner report for one enrolled student on one Academic Project.
 * Reads the student's isolated attempt organisation — not My Organisation.
 *
 * @param {{
 *   academicProjectId: string;
 *   studentUserId: string;
 *   academicYearId?: string | null;
 *   db?: import("@prisma/client").PrismaClient;
 * }} opts
 */
export async function getExaminerAcademicProjectStudentReport(opts) {
  const db = opts.db || prisma;
  const project = await db.project.findUnique({ where: { id: opts.academicProjectId } });
  if (!project || project.isPersonalOrg || project.isAttemptOrg) {
    const err = new Error("Project not found.");
    // @ts-ignore
    err.code = "NOT_FOUND";
    throw err;
  }

  const enrollment = await db.projectEnrollment.findUnique({
    where: {
      projectId_studentUserId: {
        projectId: opts.academicProjectId,
        studentUserId: opts.studentUserId,
      },
    },
    include: {
      attempts: { orderBy: { attemptNumber: "desc" }, include: { grade: true } },
    },
  });
  if (!enrollment) {
    const err = new Error("Student is not enrolled on this project.");
    // @ts-ignore
    err.code = "NOT_FOUND";
    throw err;
  }

  const latest = enrollment.attempts[0] || null;
  const workspace = await resolveParticipantWorkspace(db, opts.academicProjectId, opts.studentUserId);

  const observation = await getExaminerStudentObservation(opts.studentUserId, {
    academicYearId: opts.academicYearId,
    orgProjectId: workspace?.id || null,
    db,
  });

  const timer = latest
    ? computeAttemptTimer({ attempt: latest, project })
    : computeAttemptTimer({ attempt: null, project });
  const status = humanAcademicProjectStatus({
    project,
    enrollment,
    latestAttempt: latest,
    timer,
  });
  const grade = latest?.grade || null;
  const assessment = await getOrCreateProjectAssessment(db, {
    projectId: opts.academicProjectId,
    createIfMissing: false,
  });
  const orgId = workspace?.id || latest?.workspaceProjectId || null;
  let live = null;
  if (orgId && assessment) {
    try {
      live = await computeLiveProcessScore(db, {
        orgId,
        assessment,
        academicSlateId: latest?.academicSlateId || null,
      });
    } catch {
      live = null;
    }
  }
  const stageKey = live?.currentStageKey || latest?.currentStageKey || observation?.progress?.summary?.currentStageKey || null;

  return {
    ...observation,
    academicProject: {
      id: project.id,
      name: project.name,
      purpose: project.purpose,
      organizationName: project.organizationName || project.name,
    },
    attempt: serializeAttempt(latest),
    timer,
    status,
    currentStageKey: stageKey,
    currentStageLabel: stageKey ? OBSERVATION_STAGE_LABELS[stageKey] || stageKey : null,
    marks:
      live || grade
        ? {
            autoScore: live?.autoScore ?? grade?.autoScore,
            manualScore: grade?.manualScore ?? null,
            finalScore: live?.finalScore ?? grade?.finalScore,
            finalPercent: live?.finalPercent ?? grade?.finalPercent,
            totalMarks: live?.totalMarks || assessment?.totalMarks || null,
            status: grade?.status || null,
            passFail: live?.passFail ?? grade?.passFail,
            live: Boolean(live),
            completedCount: live?.completedCount ?? null,
            allowedCount: live?.allowedCount ?? null,
          }
        : null,
    processScores: live?.processes || sectionSnapshot(grade?.checkpointResults),
  };
}

/**
 * Stored section scores from the last auto-evaluation (older grades used flat checkpoints).
 * @param {unknown} results
 */
function sectionSnapshot(results) {
  if (!Array.isArray(results) || !results.length) return null;
  return results.every((r) => r && Array.isArray(r.items)) ? results : null;
}
