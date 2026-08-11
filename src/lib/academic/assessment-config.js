/**
 * Examiner assessment configuration (checkpoints + scoring mode).
 */
import {
  AssessmentCheckpointKind,
  AssessmentGradingMode,
  OrgProcurementMethod,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { OBSERVATION_STAGE_KEYS, OBSERVATION_STAGE_LABELS } from "@/lib/projects/derive-org-progress";
import { getOrCreateProjectAssessment } from "@/lib/academic/assessment-evaluate";
import {
  humanGradingMode,
  computeFinalScore,
} from "@/lib/academic/assessment-scoring";

const CHECKPOINT_KINDS = new Set(Object.values(AssessmentCheckpointKind));
const GRADING_MODES = new Set(Object.values(AssessmentGradingMode));
const METHODS = new Set(Object.values(OrgProcurementMethod));

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
  const checkpoints = (assessment.checkpoints || []).filter((c) => c.isActive !== false);
  const autoMaxMarks = checkpoints.reduce((s, c) => s + Math.max(0, c.marks || 0), 0);
  const manualMax =
    assessment.gradingMode === AssessmentGradingMode.AUTOMATIC
      ? 0
      : Math.max(0, assessment.manualMaxMarks || 0);
  return {
    id: assessment.id,
    projectId: assessment.projectId,
    gradingMode: assessment.gradingMode,
    gradingModeLabel: humanGradingMode(assessment.gradingMode),
    manualMaxMarks: manualMax,
    autoMaxMarks,
    totalPossibleMarks: autoMaxMarks + manualMax,
    passMarkPercent: assessment.passMarkPercent,
    resultsReleased: assessment.resultsReleased,
    scoringRule:
      "Final score = min(auto score + manual score, total possible). Pass when final % ≥ pass mark.",
    checkpoints: (assessment.checkpoints || []).map((c) => ({
      id: c.id,
      sortOrder: c.sortOrder,
      label: c.label,
      kind: c.kind,
      stageKey: c.stageKey,
      stageLabel: c.stageKey ? OBSERVATION_STAGE_LABELS[c.stageKey] || c.stageKey : null,
      procurementMethod: c.procurementMethod,
      marks: c.marks,
      isActive: c.isActive,
    })),
    createdAt: assessment.createdAt,
    updatedAt: assessment.updatedAt,
  };
}

export function assessmentCheckpointCatalogue() {
  return {
    kinds: [
      {
        value: AssessmentCheckpointKind.STAGE_COMPLETED,
        label: "Stage completed",
        needsStage: true,
      },
      {
        value: AssessmentCheckpointKind.STAGE_REACHED,
        label: "Stage reached",
        needsStage: true,
      },
      {
        value: AssessmentCheckpointKind.PROCUREMENT_METHOD,
        label: "Correct procurement method",
        needsMethod: true,
      },
      {
        value: AssessmentCheckpointKind.ATTEMPT_SUBMITTED,
        label: "Attempt submitted",
      },
    ],
    stages: OBSERVATION_STAGE_KEYS.map((key) => ({
      value: key,
      label: OBSERVATION_STAGE_LABELS[key],
    })),
    methods: Object.values(OrgProcurementMethod).map((value) => ({
      value,
      label: value.charAt(0) + value.slice(1).toLowerCase(),
    })),
    gradingModes: [
      { value: AssessmentGradingMode.AUTOMATIC, label: "Automatic only" },
      { value: AssessmentGradingMode.MANUAL, label: "Manual only" },
      { value: AssessmentGradingMode.COMBINED, label: "Automatic + manual" },
    ],
  };
}

/**
 * @param {any} body
 */
export function validateAssessmentConfigInput(body) {
  /** @type {Record<string, string>} */
  const errors = {};
  const modeIn = cleanText(body?.gradingMode).toUpperCase();
  const gradingMode = GRADING_MODES.has(modeIn)
    ? modeIn
    : AssessmentGradingMode.COMBINED;

  let passMarkPercent = 50;
  if (body?.passMarkPercent !== undefined && body?.passMarkPercent !== "") {
    const n = Number(body.passMarkPercent);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      errors.passMarkPercent = "Pass mark must be a whole number from 0 to 100.";
    } else {
      passMarkPercent = n;
    }
  }

  let manualMaxMarks = 0;
  if (body?.manualMaxMarks !== undefined && body?.manualMaxMarks !== "") {
    const n = Number(body.manualMaxMarks);
    if (!Number.isInteger(n) || n < 0 || n > 1000) {
      errors.manualMaxMarks = "Manual marks must be a whole number from 0 to 1000.";
    } else {
      manualMaxMarks = n;
    }
  }

  if (gradingMode === AssessmentGradingMode.AUTOMATIC) {
    manualMaxMarks = 0;
  } else if (
    gradingMode === AssessmentGradingMode.MANUAL &&
    manualMaxMarks <= 0
  ) {
    errors.manualMaxMarks = "Manual assessment needs a manual marks total greater than 0.";
  } else if (
    gradingMode === AssessmentGradingMode.COMBINED &&
    manualMaxMarks < 0
  ) {
    errors.manualMaxMarks = "Manual marks cannot be negative.";
  }

  const rawCheckpoints = Array.isArray(body?.checkpoints) ? body.checkpoints : [];
  /** @type {any[]} */
  const checkpoints = [];
  rawCheckpoints.forEach((raw, index) => {
    const label = cleanText(raw?.label) || `Checkpoint ${index + 1}`;
    const kindIn = cleanText(raw?.kind).toUpperCase();
    if (!CHECKPOINT_KINDS.has(kindIn)) {
      errors[`checkpoints.${index}.kind`] = "Choose a valid checkpoint type.";
      return;
    }
    const marks = Number(raw?.marks);
    if (!Number.isInteger(marks) || marks < 0 || marks > 500) {
      errors[`checkpoints.${index}.marks`] = "Marks must be a whole number from 0 to 500.";
      return;
    }
    let stageKey = cleanText(raw?.stageKey).toUpperCase() || null;
    let procurementMethod = cleanText(raw?.procurementMethod).toUpperCase() || null;
    if (
      kindIn === AssessmentCheckpointKind.STAGE_COMPLETED ||
      kindIn === AssessmentCheckpointKind.STAGE_REACHED
    ) {
      if (!stageKey || !OBSERVATION_STAGE_KEYS.includes(stageKey)) {
        errors[`checkpoints.${index}.stageKey`] = "Choose a procurement stage.";
        return;
      }
      procurementMethod = null;
    } else if (kindIn === AssessmentCheckpointKind.PROCUREMENT_METHOD) {
      if (!procurementMethod || !METHODS.has(procurementMethod)) {
        errors[`checkpoints.${index}.procurementMethod`] =
          "Choose a procurement method.";
        return;
      }
      stageKey = null;
    } else {
      stageKey = null;
      procurementMethod = null;
    }
    checkpoints.push({
      label: label.slice(0, 255),
      kind: kindIn,
      stageKey,
      procurementMethod,
      marks,
      sortOrder: index,
      isActive: raw?.isActive === false ? false : true,
    });
  });

  if (
    gradingMode !== AssessmentGradingMode.MANUAL &&
    checkpoints.filter((c) => c.isActive).length === 0
  ) {
    errors.checkpoints = "Add at least one checkpoint for automatic scoring.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: {
      gradingMode,
      passMarkPercent,
      manualMaxMarks,
      resultsReleased: body?.resultsReleased === true,
      checkpoints,
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
  const validated = validateAssessmentConfigInput(opts.body);
  if (!validated.ok) {
    const err = new Error("Please fix the highlighted fields.");
    // @ts-ignore
    err.code = "VALIDATION";
    // @ts-ignore
    err.errors = validated.errors;
    throw err;
  }

  const project = await db.project.findUnique({ where: { id: opts.projectId } });
  if (!project || project.isPersonalOrg) {
    const err = new Error("Not found.");
    // @ts-ignore
    err.code = "NOT_FOUND";
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
            gradingMode: validated.data.gradingMode,
            manualMaxMarks: validated.data.manualMaxMarks,
            passMarkPercent: validated.data.passMarkPercent,
            resultsReleased: validated.data.resultsReleased,
          },
        })
      : await tx.projectAssessment.create({
          data: {
            projectId: opts.projectId,
            gradingMode: validated.data.gradingMode,
            manualMaxMarks: validated.data.manualMaxMarks,
            passMarkPercent: validated.data.passMarkPercent,
            resultsReleased: validated.data.resultsReleased,
          },
        });

    await tx.assessmentCheckpoint.deleteMany({ where: { assessmentId: row.id } });
    if (validated.data.checkpoints.length > 0) {
      await tx.assessmentCheckpoint.createMany({
        data: validated.data.checkpoints.map((c) => ({
          assessmentId: row.id,
          ...c,
        })),
      });
    }

    return tx.projectAssessment.findUnique({
      where: { id: row.id },
      include: { checkpoints: { orderBy: { sortOrder: "asc" } } },
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
      gradingMode: validated.data.gradingMode,
      checkpointCount: validated.data.checkpoints.length,
      manualMaxMarks: validated.data.manualMaxMarks,
      passMarkPercent: validated.data.passMarkPercent,
      resultsReleased: validated.data.resultsReleased,
    },
  });

  return serializeAssessmentConfig(assessment);
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
    include: { checkpoints: { orderBy: { sortOrder: "asc" } } },
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
