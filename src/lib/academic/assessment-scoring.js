/**
 * Phase 9 scoring rule (locked — do not invent alternatives):
 *
 *   autoMaxMarks     = sum of active checkpoint marks
 *   manualMaxMarks   = ProjectAssessment.manualMaxMarks (0 when mode is AUTOMATIC)
 *   totalPossible    = autoMaxMarks + manualMaxMarks
 *
 *   autoScore        = sum of marks for satisfied checkpoints (≤ autoMaxMarks)
 *   manualScore      = examiner mark in [0, manualMaxMarks] when required
 *
 *   finalScore       = min(autoScore + (manualScore ?? 0), totalPossible)
 *   finalPercent     = totalPossible > 0
 *                        ? round((finalScore / totalPossible) * 100)
 *                        : 0
 *   passFail         = set only when status is GRADED:
 *                      finalPercent >= passMarkPercent ? PASS : FAIL
 *
 * Mode behaviour:
 *   AUTOMATIC — manualMaxMarks forced to 0; GRADED after auto eval
 *   MANUAL    — checkpoints ignored for score (autoScore = 0); GRADED after manual
 *   COMBINED  — auto + manual; AUTO_SCORED until manualScore is set, then GRADED
 */

import {
  AssessmentGradingMode,
  AttemptGradeStatus,
  PassFailResult,
} from "@prisma/client";

/**
 * @param {{
 *   gradingMode: string;
 *   autoScore?: number | null;
 *   manualScore?: number | null;
 *   autoMaxMarks: number;
 *   manualMaxMarks: number;
 *   passMarkPercent: number;
 *   manualEntered?: boolean;
 * }} p
 */
export function computeFinalScore(p) {
  const mode = String(p.gradingMode || AssessmentGradingMode.COMBINED);
  const autoMax = Math.max(0, Number(p.autoMaxMarks) || 0);
  let manualMax = Math.max(0, Number(p.manualMaxMarks) || 0);
  if (mode === AssessmentGradingMode.AUTOMATIC) manualMax = 0;

  let autoScore = Math.max(0, Number(p.autoScore) || 0);
  if (mode === AssessmentGradingMode.MANUAL) autoScore = 0;
  if (autoScore > autoMax) autoScore = autoMax;

  const manualEntered =
    p.manualEntered === true ||
    (p.manualScore !== null && p.manualScore !== undefined);

  let manualScore = null;
  if (manualEntered) {
    manualScore = Math.max(0, Number(p.manualScore) || 0);
    if (manualScore > manualMax) manualScore = manualMax;
  }

  const totalPossible = autoMax + manualMax;
  const manualForSum = manualScore == null ? 0 : manualScore;
  const finalScore =
    totalPossible > 0 ? Math.min(autoScore + manualForSum, totalPossible) : 0;
  const finalPercent =
    totalPossible > 0 ? Math.round((finalScore / totalPossible) * 100) : 0;
  const passMark = Math.min(100, Math.max(0, Number(p.passMarkPercent) || 50));

  /** @type {import("@prisma/client").AttemptGradeStatus} */
  let status = AttemptGradeStatus.NOT_GRADED;
  if (mode === AssessmentGradingMode.AUTOMATIC) {
    status = AttemptGradeStatus.GRADED;
  } else if (mode === AssessmentGradingMode.MANUAL) {
    status = manualEntered ? AttemptGradeStatus.GRADED : AttemptGradeStatus.NOT_GRADED;
  } else if (manualMax <= 0) {
    status = AttemptGradeStatus.GRADED;
  } else if (manualEntered) {
    status = AttemptGradeStatus.GRADED;
  } else {
    status = AttemptGradeStatus.AUTO_SCORED;
  }

  return {
    autoScore,
    manualScore,
    autoMaxMarks: autoMax,
    manualMaxMarks: manualMax,
    totalPossibleMarks: totalPossible,
    finalScore,
    finalPercent,
    passFail: status === AttemptGradeStatus.GRADED
      ? finalPercent >= passMark
        ? PassFailResult.PASS
        : PassFailResult.FAIL
      : null,
    status,
    passMarkPercent: passMark,
  };
}

/**
 * @param {string | null | undefined} status
 */
export function humanGradeStatus(status) {
  const s = String(status || "");
  if (s === AttemptGradeStatus.GRADED) return { key: "graded", label: "Graded" };
  if (s === AttemptGradeStatus.AUTO_SCORED) {
    return { key: "pending_manual", label: "Awaiting manual mark" };
  }
  return { key: "not_graded", label: "Not graded" };
}

/**
 * @param {string | null | undefined} passFail
 */
export function humanPassFail(passFail) {
  if (passFail === PassFailResult.PASS) return { key: "pass", label: "Pass" };
  if (passFail === PassFailResult.FAIL) return { key: "fail", label: "Fail" };
  return { key: "pending", label: "—" };
}

/**
 * @param {string | null | undefined} mode
 */
export function humanGradingMode(mode) {
  const m = String(mode || "");
  if (m === AssessmentGradingMode.AUTOMATIC) return "Automatic";
  if (m === AssessmentGradingMode.MANUAL) return "Manual";
  if (m === AssessmentGradingMode.COMBINED) return "Automatic + manual";
  return m || "—";
}

export { AssessmentGradingMode, AttemptGradeStatus, PassFailResult };
