/**
 * Decision options for org workflow task forms — one positive action per step type
 * so users are not shown duplicate Approve / Complete choices that do the same thing.
 *
 * @param {string | null | undefined} actionKey
 * @param {{
 *   isEmergencyPlan?: boolean;
 *   includeReturnReject?: boolean;
 *   includeFlagException?: boolean;
 *   isProcurementStep?: boolean;
 * }} [opts]
 * @returns {{ value: string; label: string }[]}
 */
export function workflowDecisionOptions(actionKey, opts = {}) {
  const key = String(actionKey || "").trim().toUpperCase();
  const includeReturnReject = opts.includeReturnReject !== false;
  /** @type {{ value: string; label: string }[]} */
  const options = [];

  if (key === "COMPLETE") {
    options.push({
      value: "COMPLETE",
      label: opts.isProcurementStep
        ? "Complete & forward"
        : opts.isEmergencyPlan
          ? "Approve & forward"
          : "Approve consolidation & forward",
    });
  } else if (key === "VERIFY") {
    options.push({ value: "VERIFY", label: "Verify & forward" });
  } else if (key === "SELECT_METHOD") {
    options.push({ value: "SELECT_METHOD", label: "Recommend method (Form 5 Part II)" });
  } else if (key === "SUBMIT") {
    options.push({ value: "SUBMIT", label: "Submit" });
  } else {
    options.push({ value: "APPROVE", label: "Approve & forward" });
  }

  if (includeReturnReject && key !== "SELECT_METHOD") {
    options.push({ value: "RETURN", label: "Return for correction" });
    options.push({ value: "REJECT", label: "Reject" });
  }

  if (opts.includeFlagException) {
    options.push({ value: "FLAG_EXCEPTION", label: "Flag exception" });
  }

  return options;
}

const POSITIVE_DECISIONS = new Set(["COMPLETE", "APPROVE", "SUBMIT", "VERIFY"]);

/** @type {[RegExp, string][]} */
const STEP_ACTION_LABELS = [
  [/^create procurement requisition/i, "Submit requisition"],
  [/^review requisition/i, "Endorse requisition and forward"],
  [/^verify procurement plan/i, "Confirm item is in plan and forward"],
  [/^verify funding/i, "Confirm funds available and forward"],
  [/^approve requisition/i, "Approve requisition and forward"],
  [/^approve procurement method/i, "Approve procurement method"],
  [/^issue purchase instruction/i, "Issue purchase instruction"],
  [/^issue rfqs/i, "Issue RFQs"],
  [/^advertise tender/i, "Advertise tender"],
  [/^record delivery|^delivery$/i, "Receive delivered items and forward"],
  [/^verify\/accept delivery|^certify delivery|^inspection\/acceptance/i, "Accept delivery and forward"],
  [/^process invoice|^invoice verification|^verify invoice/i, "Process invoice and forward"],
  [/^approve payment|^payment approval/i, "Approve payment and forward"],
  [/^record payment|^payment recording/i, "Record payment and forward"],
  [/^close procurement|^procurement closure/i, "Close procurement"],
];

/**
 * Names the positive action after the step ("Approve payment and forward") instead of a generic verb.
 * @param {string | null | undefined} title Task title, e.g. "Approve Payment: PROC-2026-0001".
 */
export function workflowStepActionLabel(title) {
  const step = String(title || "").split(":")[0].trim();
  return STEP_ACTION_LABELS.find(([re]) => re.test(step))?.[1] || "";
}

/**
 * Label for one decision option on a task, using the step-specific wording for the positive decision.
 * @param {{ value: string; label: string }} opt
 * @param {string | null | undefined} title
 */
export function workflowDecisionLabelForTask(opt, title) {
  const stepLabel = workflowStepActionLabel(title);
  return stepLabel && POSITIVE_DECISIONS.has(opt.value) ? stepLabel : opt.label;
}

/**
 * True when the decision moves the record forward (not return / reject / flag).
 * @param {string | null | undefined} decision
 */
export function isPositiveWorkflowDecision(decision) {
  return POSITIVE_DECISIONS.has(String(decision || "").trim().toUpperCase());
}

/**
 * Default selected decision for a pending task’s action key.
 * @param {string | null | undefined} actionKey
 */
export function defaultWorkflowDecision(actionKey) {
  const key = String(actionKey || "").trim().toUpperCase();
  if (
    key === "COMPLETE" ||
    key === "VERIFY" ||
    key === "SELECT_METHOD" ||
    key === "SUBMIT"
  ) {
    return key;
  }
  return "APPROVE";
}

/**
 * Short help under the decision dropdown.
 * @param {string} decision
 */
export function workflowDecisionHelp(decision) {
  const d = String(decision || "").trim().toUpperCase();
  if (d === "RETURN") {
    return "Sends the record back to the creator to fix and resubmit. It is not a final rejection.";
  }
  if (d === "REJECT") {
    return "Ends this process. The record is rejected and cannot continue in this workflow.";
  }
  if (d === "COMPLETE" || d === "APPROVE" || d === "VERIFY" || d === "SUBMIT") {
    return "Confirms your step and sends the record to the next role in the process.";
  }
  if (d === "SELECT_METHOD") {
    return "Saves Form 5 Part II and sends the recommended method to the Contracts Committee for approval.";
  }
  if (d === "FLAG_EXCEPTION") {
    return "Flags a funding or compliance concern for follow-up without fully approving.";
  }
  return "";
}
