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
  validateAllowedProcessSet,
} from "@/lib/academic/assessment-process-catalogue";
import {
  PROCESS_SECTION_CODES,
  SCORING_GROUP_LABELS,
  SCORING_SECTIONS,
  applyProcessAvailability,
  buildScoringTree,
  scoringItemRowKey,
  scoringTreeToRows,
} from "@/lib/academic/assessment-sections";
import {
  intersectCodes,
  projectProgrammeCodes,
  resolveEffectiveProcessCodes,
} from "@/lib/academic/programme-processes";

/**
 * @param {unknown} value
 */
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Process codes students may run. Uses the saved Processes-tab list; older projects fall back to
 * the process sections that were switched on in scoring (which used to mean "available").
 * @param {{ enabledProcessCodes?: unknown; processes?: any[]; totalMarks?: number } | null | undefined} assessment
 * @returns {string[]}
 */
export function deriveEnabledProcessCodes(assessment) {
  if (Array.isArray(assessment?.enabledProcessCodes)) {
    return assessment.enabledProcessCodes.filter(
      (c) => typeof c === "string" && PROCESS_SECTION_CODES.has(c),
    );
  }
  const tree = buildScoringTree(
    assessment?.processes || [],
    assessment?.totalMarks || DEFAULT_ASSESSMENT_TOTAL_MARKS,
  );
  return tree.sections.filter((s) => s.processCode && s.isAllowed).map((s) => s.key);
}

/**
 * Programme × year list for an academic project (null = no programme gate).
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {string} projectId
 */
export async function assessmentProgrammeCodes(db, projectId) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { programmeId: true, academicYearId: true },
  });
  return project ? projectProgrammeCodes(db, project) : null;
}

/**
 * @param {any} assessment
 * @param {string[] | null} [programmeCodes] programme × year list; examiner choices outside it are kept but inactive
 */
export function serializeAssessmentConfig(assessment, programmeCodes = null) {
  if (!assessment) return null;
  const totalMarks = Math.max(0, assessment.totalMarks || DEFAULT_ASSESSMENT_TOTAL_MARKS);
  const examinerCodes = deriveEnabledProcessCodes(assessment);
  const enabledProcessCodes = intersectCodes(examinerCodes, programmeCodes) || examinerCodes;
  const enabledSet = new Set(enabledProcessCodes);
  const programmeSet = programmeCodes ? new Set(programmeCodes) : null;
  const tree = buildScoringTree(
    applyProcessAvailability(assessment.processes || [], enabledProcessCodes),
    totalMarks,
  );
  const sections = tree.sections.map((s) => {
    const meta = s.processCode ? assessmentProcessMeta(s.processCode) : null;
    return {
      ...s,
      isAvailable: s.processCode ? enabledSet.has(s.key) : true,
      isProgrammeEnabled: s.processCode && programmeSet ? programmeSet.has(s.key) : true,
      dependsOn: meta?.dependsOn || [],
      dependsOnAny: meta?.dependsOnAny || [],
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
    enabledProcessCodes: examinerCodes,
    effectiveProcessCodes: enabledProcessCodes,
    programmeProcessCodes: programmeCodes,
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
      defaultAllowed: p.defaultAllowed !== false,
    })),
  };
}

/** @deprecated use assessmentScoringCatalogue */
export function assessmentCheckpointCatalogue() {
  return assessmentScoringCatalogue();
}

/**
 * Scoring payload. A process section switch means "scored"; availability is set on the
 * Processes tab and passed in as `enabledCodes` (unavailable processes are never scored).
 * @param {any} body
 * @param {Iterable<string>} [enabledCodes]
 */
export function validateAssessmentProcessConfig(body, enabledCodes) {
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

  const tree = buildScoringTree(
    enabledCodes ? applyProcessAvailability(incoming, enabledCodes) : incoming,
    totalMarks,
  );
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
    return serializeAssessmentConfig(assessment, await projectProgrammeCodes(db, project));
  }

  const existing = await db.projectAssessment.findUnique({
    where: { projectId: opts.projectId },
    include: { processes: true },
  });
  // Freeze availability before scoring switches stop meaning "available" for legacy projects.
  const enabledProcessCodes = existing
    ? deriveEnabledProcessCodes(existing)
    : deriveEnabledProcessCodes({ processes: [] });

  const validated = validateAssessmentProcessConfig(opts.body, enabledProcessCodes);
  if (!validated.ok) {
    const err = new Error("Please fix the highlighted fields.");
    // @ts-ignore
    err.code = "VALIDATION";
    // @ts-ignore
    err.errors = validated.errors;
    throw err;
  }

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
            enabledProcessCodes,
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
            enabledProcessCodes,
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
      scoredProcessCount: validated.data.processes.filter(
        (p) => p.isAllowed && PROCESS_SECTION_CODES.has(p.processCode),
      ).length,
      passMarkPercent: validated.data.passMarkPercent,
    },
  });

  return serializeAssessmentConfig(assessment, await projectProgrammeCodes(db, project));
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
  if (!assessment) return null;
  if (!Array.isArray(assessment.enabledProcessCodes)) {
    const rows = (assessment.processes || []).filter((p) => PROCESS_SECTION_CODES.has(p.processCode));
    if (!rows.length) return null;
  }
  return deriveEnabledProcessCodes(assessment);
}

/**
 * Processes tab: which engine processes students may run in this project. Newly enabled
 * processes are scored by default; disabled ones stop being scored.
 * @param {{
 *   projectId: string;
 *   actorUserId: string;
 *   enabledProcessCodes: unknown;
 *   db?: import("@prisma/client").PrismaClient;
 * }} opts
 */
export async function setProjectEnabledProcesses(opts) {
  const db = opts.db || prisma;
  const raw = Array.isArray(opts.enabledProcessCodes) ? opts.enabledProcessCodes : null;
  if (!raw) {
    const err = new Error("Choose the processes to enable.");
    // @ts-ignore
    err.code = "VALIDATION";
    throw err;
  }
  const programmeCodes = await assessmentProgrammeCodes(db, opts.projectId);
  const programmeSet = programmeCodes ? new Set(programmeCodes) : null;
  const requested = [
    ...new Set(raw.map((c) => cleanText(c).toUpperCase()).filter((c) => PROCESS_SECTION_CODES.has(c))),
  ];
  const blocked = programmeSet ? requested.filter((c) => !programmeSet.has(c)) : [];
  if (blocked.length) {
    const err = new Error("Some processes are disabled for this programme and year.");
    // @ts-ignore
    err.code = "VALIDATION";
    throw err;
  }
  const depErrors = validateAllowedProcessSet(requested);
  if (depErrors.length) {
    const err = new Error(depErrors[0]);
    // @ts-ignore
    err.code = "VALIDATION";
    throw err;
  }

  const assessment = await getOrCreateProjectAssessment(db, {
    projectId: opts.projectId,
    createIfMissing: true,
  });
  const previousCodes = deriveEnabledProcessCodes(assessment);
  const previous = new Set(previousCodes);
  // Keep the examiner's choice for programme-disabled processes so re-enabling restores it.
  const merged = programmeSet
    ? [...requested, ...previousCodes.filter((c) => !programmeSet.has(c) && !requested.includes(c))]
    : requested;
  const codes = validateAllowedProcessSet(merged).length ? requested : merged;
  const next = new Set(codes);
  const totalMarks = assessment.totalMarks || DEFAULT_ASSESSMENT_TOTAL_MARKS;
  const rows = (assessment.processes || []).map((r) => {
    if (!PROCESS_SECTION_CODES.has(r.processCode)) return r;
    if (!next.has(r.processCode)) return { ...r, isAllowed: false, marksPinned: false };
    if (!previous.has(r.processCode)) return { ...r, isAllowed: true };
    return r;
  });
  const tree = buildScoringTree(rows, totalMarks);
  const nextRows = scoringTreeToRows(tree.sections);

  const updated = await db.$transaction(async (tx) => {
    await tx.projectAssessment.update({
      where: { id: assessment.id },
      data: { enabledProcessCodes: codes },
    });
    await tx.assessmentProcess.deleteMany({ where: { assessmentId: assessment.id } });
    await tx.assessmentProcess.createMany({
      data: nextRows.map((p, index) => ({
        assessmentId: assessment.id,
        processCode: p.processCode,
        sortOrder: index,
        isAllowed: p.isAllowed,
        marks: p.marks,
        marksPinned: p.marksPinned,
      })),
    });
    return tx.projectAssessment.findUnique({
      where: { id: assessment.id },
      include: {
        checkpoints: { orderBy: { sortOrder: "asc" } },
        processes: { orderBy: { sortOrder: "asc" } },
      },
    });
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ASSESSMENT_UPDATED,
    actorUserId: opts.actorUserId,
    meta: {
      projectId: opts.projectId,
      assessmentId: assessment.id,
      action: "SET_ENABLED_PROCESSES",
      enabledProcessCodes: codes,
    },
  });

  return serializeAssessmentConfig(updated, programmeCodes);
}

/**
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} orgProjectId
 * @returns {Promise<string[] | null>} null = show full catalogue (personal org)
 */
export async function resolveAllowedProcessCodesForOrgProject(db, orgProjectId) {
  return resolveEffectiveProcessCodes(db, orgProjectId);
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

  return serializeAssessmentConfig(assessment, await assessmentProgrammeCodes(db, opts.projectId));
}

export const RESULTS_VIEW = { SUMMARY: "SUMMARY", DETAILS: "DETAILS" };

/** @param {unknown} value */
export function parseResultsView(value) {
  const v = String(value || "").trim().toUpperCase();
  return v === RESULTS_VIEW.SUMMARY || v === RESULTS_VIEW.DETAILS ? v : null;
}

export { computeFinalScore, getOrCreateProjectAssessment };
export { validateAssessmentProcessConfig as validateAssessmentConfigInput };
