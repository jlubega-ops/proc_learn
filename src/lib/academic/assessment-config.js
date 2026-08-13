/**
 * Examiner assessment configuration — automatic process completion against a grading scale.
 */
import { AssessmentGradingMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { getOrCreateProjectAssessment } from "@/lib/academic/assessment-evaluate";
import { humanGradingMode, computeFinalScore } from "@/lib/academic/assessment-scoring";
import {
  ASSESSMENT_PASS_MARK_PRESETS,
  ASSESSMENT_PROCESS_CATALOGUE,
  DEFAULT_ASSESSMENT_PASS_MARK,
  DEFAULT_ASSESSMENT_TOTAL_MARKS,
  assessmentProcessMeta,
  processDisableBlockers,
  redistributeProcessMarks,
  validateAllowedProcessSet,
} from "@/lib/academic/assessment-process-catalogue";

/**
 * @param {unknown} value
 */
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @param {any} assessment
 */
export function serializeAssessmentConfig(assessment) {
  if (!assessment) return null;
  const processes = (assessment.processes || []).map((p) => {
    const meta = assessmentProcessMeta(p.processCode);
    return {
      id: p.id,
      processCode: p.processCode,
      name: meta?.name || p.processCode,
      summary: meta?.summary || "",
      group: meta?.group || "CORE",
      dependsOn: meta?.dependsOn || [],
      dependsOnAny: meta?.dependsOnAny || [],
      sortOrder: p.sortOrder,
      isAllowed: p.isAllowed !== false,
      marks: p.marks,
      marksPinned: Boolean(p.marksPinned),
      disableBlockers: [],
    };
  });
  const allowedCodes = processes.filter((p) => p.isAllowed).map((p) => p.processCode);
  for (const row of processes) {
    row.disableBlockers = processDisableBlockers(row.processCode, allowedCodes);
  }
  const autoMaxMarks = processes
    .filter((p) => p.isAllowed)
    .reduce((s, p) => s + Math.max(0, p.marks || 0), 0);
  const totalMarks = Math.max(0, assessment.totalMarks || autoMaxMarks || DEFAULT_ASSESSMENT_TOTAL_MARKS);
  return {
    id: assessment.id,
    projectId: assessment.projectId,
    gradingMode: AssessmentGradingMode.AUTOMATIC,
    gradingModeLabel: humanGradingMode(AssessmentGradingMode.AUTOMATIC),
    manualMaxMarks: 0,
    autoMaxMarks,
    totalMarks,
    totalPossibleMarks: totalMarks,
    passMarkPercent: assessment.passMarkPercent,
    scoringEnabled: assessment.scoringEnabled !== false,
    resultsReleased: assessment.resultsReleased,
    scoringRule:
      "Automatic: each allowed process scores its marks when that process is completed in the organisation. Pass when final % ≥ pass mark.",
    processes,
    checkpoints: [],
    createdAt: assessment.createdAt,
    updatedAt: assessment.updatedAt,
  };
}

export function assessmentScoringCatalogue() {
  return {
    passMarkPresets: ASSESSMENT_PASS_MARK_PRESETS,
    defaultTotalMarks: DEFAULT_ASSESSMENT_TOTAL_MARKS,
    defaultPassMarkPercent: DEFAULT_ASSESSMENT_PASS_MARK,
    processes: ASSESSMENT_PROCESS_CATALOGUE.map((p) => ({
      code: p.code,
      name: p.name,
      summary: p.summary,
      dependsOn: p.dependsOn,
      dependsOnAny: p.dependsOnAny || [],
      group: p.group,
    })),
  };
}

/** @deprecated use assessmentScoringCatalogue */
export function assessmentCheckpointCatalogue() {
  return assessmentScoringCatalogue();
}

/**
 * @param {any} body
 */
export function validateAssessmentProcessConfig(body) {
  /** @type {Record<string, string>} */
  const errors = {};

  let totalMarks = DEFAULT_ASSESSMENT_TOTAL_MARKS;
  if (body?.totalMarks !== undefined && body?.totalMarks !== "") {
    const n = Number(body.totalMarks);
    if (!Number.isInteger(n) || n < 10 || n > 1000) {
      errors.totalMarks = "Total marks must be a whole number from 10 to 1000.";
    } else {
      totalMarks = n;
    }
  }

  let passMarkPercent = DEFAULT_ASSESSMENT_PASS_MARK;
  if (body?.passMarkPercent !== undefined && body?.passMarkPercent !== "") {
    const n = Number(body.passMarkPercent);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      errors.passMarkPercent = "Pass mark must be a whole number from 1 to 100.";
    } else {
      passMarkPercent = n;
    }
  }

  const byCode = new Map(ASSESSMENT_PROCESS_CATALOGUE.map((p) => [p.code, p]));
  const raw = Array.isArray(body?.processes) ? body.processes : [];
  /** @type {Array<{ processCode: string; isAllowed: boolean; marks: number; marksPinned: boolean }>} */
  const incoming = [];
  raw.forEach((row, index) => {
    const code = cleanText(row?.processCode).toUpperCase();
    if (!byCode.has(code)) {
      errors[`processes.${index}.processCode`] = "Unknown process.";
      return;
    }
    incoming.push({
      processCode: code,
      isAllowed: row?.isAllowed !== false,
      marksPinned: row?.marksPinned === true,
      marks: Math.max(0, Math.round(Number(row?.marks) || 0)),
    });
  });

  const merged = ASSESSMENT_PROCESS_CATALOGUE.map((meta) => {
    const found = incoming.find((r) => r.processCode === meta.code);
    return (
      found || {
        processCode: meta.code,
        isAllowed: true,
        marksPinned: false,
        marks: 0,
      }
    );
  });

  const allowedCodes = merged.filter((p) => p.isAllowed).map((p) => p.processCode);
  const depErrors = validateAllowedProcessSet(allowedCodes);
  if (depErrors.length) errors.processes = depErrors[0];

  const split = redistributeProcessMarks(merged, totalMarks);
  if (!split.ok && split.error) errors.marks = split.error;

  const scoringEnabled = body?.scoringEnabled !== false;

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: {
      gradingMode: AssessmentGradingMode.AUTOMATIC,
      manualMaxMarks: 0,
      passMarkPercent,
      totalMarks,
      scoringEnabled,
      resultsReleased: body?.resultsReleased === true,
      processes: split.rows,
    },
  };
}

/**
 * @param {{
 *   projectId: string;
 *   actorUserId: string;
 *   body: any;
 *   db?: import("@prisma/client").PrismaClient;
 * }} opts
 */
export async function upsertProjectAssessmentConfig(opts) {
  const db = opts.db || prisma;
  const project = await db.project.findUnique({ where: { id: opts.projectId } });
  if (!project || project.isPersonalOrg || project.isAttemptOrg) {
    const err = new Error("Not found.");
    // @ts-ignore
    err.code = "NOT_FOUND";
    throw err;
  }

  // Practice: allow toggling scoring on/off without requiring full process payload.
  if (
    opts.body?.action === "enable_scoring" ||
    opts.body?.action === "disable_scoring" ||
    (opts.body?.scoringEnabled !== undefined && !Array.isArray(opts.body?.processes))
  ) {
    const enable =
      opts.body?.action === "enable_scoring"
        ? true
        : opts.body?.action === "disable_scoring"
          ? false
          : opts.body?.scoringEnabled !== false;
    let assessment = await getOrCreateProjectAssessment(db, {
      projectId: opts.projectId,
      createIfMissing: true,
      scoringEnabled: enable,
    });
    assessment = await db.projectAssessment.update({
      where: { id: assessment.id },
      data: { scoringEnabled: enable },
      include: {
        checkpoints: { orderBy: { sortOrder: "asc" } },
        processes: { orderBy: { sortOrder: "asc" } },
      },
    });
    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ASSESSMENT_UPDATED,
      actorUserId: opts.actorUserId,
      meta: {
        projectId: opts.projectId,
        assessmentId: assessment.id,
        scoringEnabled: enable,
      },
    });
    return serializeAssessmentConfig(assessment);
  }

  const validated = validateAssessmentProcessConfig(opts.body);
  if (!validated.ok) {
    const err = new Error("Please fix the highlighted fields.");
    // @ts-ignore
    err.code = "VALIDATION";
    // @ts-ignore
    err.errors = validated.errors;
    throw err;
  }

  const existing = await db.projectAssessment.findUnique({
    where: { projectId: opts.projectId },
  });

  const assessment = await db.$transaction(async (tx) => {
    const row = existing
      ? await tx.projectAssessment.update({
          where: { id: existing.id },
          data: {
            gradingMode: AssessmentGradingMode.AUTOMATIC,
            manualMaxMarks: 0,
            passMarkPercent: validated.data.passMarkPercent,
            totalMarks: validated.data.totalMarks,
            scoringEnabled: validated.data.scoringEnabled,
            resultsReleased: validated.data.resultsReleased,
          },
        })
      : await tx.projectAssessment.create({
          data: {
            projectId: opts.projectId,
            gradingMode: AssessmentGradingMode.AUTOMATIC,
            manualMaxMarks: 0,
            passMarkPercent: validated.data.passMarkPercent,
            totalMarks: validated.data.totalMarks,
            scoringEnabled: validated.data.scoringEnabled,
            resultsReleased: validated.data.resultsReleased,
          },
        });

    await tx.assessmentProcess.deleteMany({ where: { assessmentId: row.id } });
    await tx.assessmentProcess.createMany({
      data: validated.data.processes.map((p, index) => ({
        assessmentId: row.id,
        processCode: p.processCode,
        sortOrder: index,
        isAllowed: p.isAllowed,
        marks: p.marks,
        marksPinned: p.marksPinned,
      })),
    });

    return tx.projectAssessment.findUnique({
      where: { id: row.id },
      include: {
        checkpoints: { orderBy: { sortOrder: "asc" } },
        processes: { orderBy: { sortOrder: "asc" } },
      },
    });
  });

  await writeAuditLog({
    eventType: existing
      ? AuditEvent.PROJECT_ASSESSMENT_UPDATED
      : AuditEvent.PROJECT_ASSESSMENT_CONFIGURED,
    actorUserId: opts.actorUserId,
    meta: {
      projectId: opts.projectId,
      assessmentId: assessment?.id,
      gradingMode: AssessmentGradingMode.AUTOMATIC,
      totalMarks: validated.data.totalMarks,
      scoringEnabled: validated.data.scoringEnabled,
      allowedProcessCount: validated.data.processes.filter((p) => p.isAllowed).length,
      passMarkPercent: validated.data.passMarkPercent,
      resultsReleased: validated.data.resultsReleased,
    },
  });

  return serializeAssessmentConfig(assessment);
}

/**
 * Allowed engine process codes for an Academic Project. Null means unrestricted (default org).
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} academicProjectId
 * @returns {Promise<string[] | null>}
 */
export async function resolveAllowedProcessCodes(db, academicProjectId) {
  if (!academicProjectId) return null;
  const assessment = await db.projectAssessment.findUnique({
    where: { projectId: academicProjectId },
    include: { processes: true },
  });
  if (!assessment?.processes?.length) return null;
  const allowed = assessment.processes.filter((p) => p.isAllowed !== false).map((p) => p.processCode);
  return allowed.length ? allowed : [];
}

/**
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} orgProjectId
 * @returns {Promise<string[] | null>} null = show full catalogue (personal org)
 */
export async function resolveAllowedProcessCodesForOrgProject(db, orgProjectId) {
  const project = await db.project.findUnique({
    where: { id: orgProjectId },
    select: {
      isPersonalOrg: true,
      isAttemptOrg: true,
      sourceAcademicProjectId: true,
    },
  });
  if (!project || project.isPersonalOrg || !project.isAttemptOrg || !project.sourceAcademicProjectId) {
    return null;
  }
  const allowed = await resolveAllowedProcessCodes(db, project.sourceAcademicProjectId);
  return allowed;
}

/**
 * @param {{
 *   projectId: string;
 *   actorUserId: string;
 *   resultsReleased: boolean;
 *   db?: import("@prisma/client").PrismaClient;
 * }} opts
 */
export async function setAssessmentResultsReleased(opts) {
  const db = opts.db || prisma;
  let assessment = await getOrCreateProjectAssessment(db, {
    projectId: opts.projectId,
    createIfMissing: false,
  });
  if (!assessment) {
    const err = new Error("Configure assessment scoring first.");
    // @ts-ignore
    err.code = "NO_ASSESSMENT";
    throw err;
  }

  assessment = await db.projectAssessment.update({
    where: { id: assessment.id },
    data: { resultsReleased: Boolean(opts.resultsReleased) },
    include: {
      checkpoints: { orderBy: { sortOrder: "asc" } },
      processes: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (opts.resultsReleased) {
    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ASSESSMENT_RESULTS_RELEASED,
      actorUserId: opts.actorUserId,
      meta: { projectId: opts.projectId, assessmentId: assessment.id },
    });
  }

  return serializeAssessmentConfig(assessment);
}

export { computeFinalScore, getOrCreateProjectAssessment };
export { validateAssessmentProcessConfig as validateAssessmentConfigInput };
