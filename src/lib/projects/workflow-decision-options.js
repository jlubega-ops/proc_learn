/**
 * Decision options for org workflow task forms — one positive action per step type
 * so users are not shown duplicate Approve / Complete choices that do the same thing.
 *
 * @param {string | null | undefined} actionKey
 * @param {{
 *   isEmergencyPlan?: boolean;
 *   includeReturnReject?: boolean;
 *   includeFlagException?: boolean;
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
      label: opts.isEmergencyPlan
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
