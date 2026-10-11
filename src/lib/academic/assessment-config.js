/**
 * Examiner assessment configuration — automatic process completion against a grading scale.
 */
import { AssessmentGradingMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { getOrCreateProjectAssessment } from "@/lib/academic/assessment-evaluate";
import { humanGradingMode, computeFinalScore } from "@/lib/academic/assessment-scoring";
import { notifyStudentsResultsReleased } from "@/lib/academic/student-academic-notifications";
import {
  ASSESSMENT_PROCESS_CATALOGUE,
  DEFAULT_ASSESSMENT_PASS_MARK,
  DEFAULT_ASSESSMENT_TOTAL_MARKS,
  assessmentProcessMeta,
  processDisableBlockers,
  validateAllowedProcessSet,
} from "@/lib/academic/assessment-process-catalogue";
import {
  PROCESS_SECTION_CODES,
  SCORING_GROUP_LABELS,
  SCORING_SECTIONS,
  buildScoringTree,
  scoringItemRowKey,
  scoringTreeToRows,
} from "@/lib/academic/assessment-sections";

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
  const totalMarks = Math.max(0, assessment.totalMarks || DEFAULT_ASSESSMENT_TOTAL_MARKS);
  const tree = buildScoringTree(assessment.processes || [], totalMarks);
  const allowedCodes = tree.sections
    .filter((s) => s.processCode && s.isAllowed)
    .map((s) => s.key);
  const sections = tree.sections.map((s) => {
    const meta = s.processCode ? assessmentProcessMeta(s.processCode) : null;
    return {
      ...s,
      dependsOn: meta?.dependsOn || [],
      dependsOnAny: meta?.dependsOnAny || [],
      disableBlockers: s.processCode ? processDisableBlockers(s.key, allowedCodes) : [],
    };
  });
  return {
    id: assessment.id,
    projectId: assessment.projectId,
    gradingMode: AssessmentGradingMode.AUTOMATIC,
    gradingModeLabel: humanGradingMode(AssessmentGradingMode.AUTOMATIC),
    manualMaxMarks: 0,
    autoMaxMarks: totalMarks,
    totalMarks,
    totalPossibleMarks: totalMarks,
    passMarkPercent: assessment.passMarkPercent,
    scoringEnabled: assessment.scoringEnabled !== false,
    resultsReleased: assessment.resultsReleased,
    resultsView: assessment.resultsView || "SUMMARY",
    sections,
    checkpoints: [],
    createdAt: assessment.createdAt,
    updatedAt: assessment.updatedAt,
  };
}

export function assessmentScoringCatalogue() {
  return {
    defaultTotalMarks: DEFAULT_ASSESSMENT_TOTAL_MARKS,
    defaultPassMarkPercent: DEFAULT_ASSESSMENT_PASS_MARK,
    groups: SCORING_GROUP_LABELS,
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

  const known = new Set(SCORING_SECTIONS.map((s) => s.key));
  const raw = Array.isArray(body?.sections) ? body.sections : [];
  /** @type {Array<{ processCode: string; isAllowed: boolean; marks: number; marksPinned: boolean }>} */
  const incoming = [];
  /** @param {any} row */
  const marksOf = (row) => Math.max(0, Math.round((Number(row?.marks) || 0) * 100) / 100);
  for (const section of raw) {
    const key = cleanText(section?.key).toUpperCase();
    if (!known.has(key)) continue;
    incoming.push({
      processCode: key,
      isAllowed: section?.isAllowed !== false,
      marksPinned: section?.marksPinned === true,
      marks: marksOf(section),
    });
    for (const item of Array.isArray(section?.items) ? section.items : []) {
      const itemKey = cleanText(item?.key).toUpperCase();
      if (!itemKey) continue;
      incoming.push({
        processCode: scoringItemRowKey(key, itemKey),
        isAllowed: item?.isAllowed !== false,
        marksPinned: item?.marksPinned === true,
        marks: marksOf(item),
      });
    }
  }

  const tree = buildScoringTree(incoming, totalMarks);
  const allowedCodes = tree.sections
    .filter((s) => s.processCode && s.isAllowed)
    .map((s) => s.key);
  const depErrors = validateAllowedProcessSet(allowedCodes);
  if (depErrors.length) errors.sections = depErrors[0];
  if (tree.error) errors.marks = tree.error;
  for (const [key, message] of Object.entries(tree.sectionErrors)) {
    errors[`section.${key}`] = message;
  }

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
      processes: scoringTreeToRows(tree.sections),
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
    (opts.body?.scoringEnabled !== undefined && !Array.isArray(opts.body?.sections))
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
      allowedProcessCount: validated.data.processes.filter(
        (p) => p.isAllowed && PROCESS_SECTION_CODES.has(p.processCode),
      ).length,
      passMarkPercent: validated.data.passMarkPercent,
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
  const rows = (assessment?.processes || []).filter((p) => PROCESS_SECTION_CODES.has(p.processCode));
  if (!rows.length) return null;
  return rows.filter((p) => p.isAllowed !== false).map((p) => p.processCode);
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
 *   resultsView?: string | null;
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

  const wasReleased = Boolean(assessment.resultsReleased);
  const previousView = assessment.resultsView || RESULTS_VIEW.SUMMARY;
  const resultsView = opts.resultsReleased
    ? parseResultsView(opts.resultsView) || previousView
    : previousView;
  assessment = await db.projectAssessment.update({
    where: { id: assessment.id },
    data: { resultsReleased: Boolean(opts.resultsReleased), resultsView },
    include: {
      checkpoints: { orderBy: { sortOrder: "asc" } },
      processes: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (opts.resultsReleased) {
    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ASSESSMENT_RESULTS_RELEASED,
      actorUserId: opts.actorUserId,
      meta: { projectId: opts.projectId, assessmentId: assessment.id, resultsView },
    });
    const upgraded = wasReleased && previousView !== RESULTS_VIEW.DETAILS && resultsView === RESULTS_VIEW.DETAILS;
    if (!wasReleased || upgraded) {
      await notifyStudentsResultsReleased(opts.projectId, db, { detailed: resultsView === RESULTS_VIEW.DETAILS }).catch(
        () => 0,
      );
    }
  } else if (wasReleased) {
    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ASSESSMENT_UPDATED,
      actorUserId: opts.actorUserId,
      meta: { projectId: opts.projectId, assessmentId: assessment.id, action: "HIDE_RESULTS" },
    });
  }

  return serializeAssessmentConfig(assessment);
}

export const RESULTS_VIEW = { SUMMARY: "SUMMARY", DETAILS: "DETAILS" };

/** @param {unknown} value */
export function parseResultsView(value) {
  const v = String(value || "").trim().toUpperCase();
  return v === RESULTS_VIEW.SUMMARY || v === RESULTS_VIEW.DETAILS ? v : null;
}

export { computeFinalScore, getOrCreateProjectAssessment };
export { validateAssessmentProcessConfig as validateAssessmentConfigInput };
