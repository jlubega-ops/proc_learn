/**
 * Thin lifecycle action → allowed organisational roles.
 * Organization Administrator is never listed — configuration only.
 * Kept free of server imports so the sidebar and pages can share it.
 */
export const LIFECYCLE_ACTION_ROLES = {
  // PPDA: the Contracts Committee makes the award decision (see COMMITTEE_LIFECYCLE_AUTHORITY).
  create_award: [],
  ask_offer_clarification: ["Procurement Officer", "Head PDU"],
  communicate_award: ["Procurement Officer", "Head PDU"],
  // The winning provider accepts or declines the award itself (provider portal / auto-response).
  accept_award: [],
  cancel_award: ["Accounting Officer", "Contracts Officer", "Head PDU"],
  update_delivery_address: ["Procurement Officer", "Contracts Officer", "Head PDU"],
  create_lpo: ["Procurement Officer", "Contracts Officer", "Head PDU"],
  approve_lpo: ["Accounting Officer", "Head PDU", "Contracts Officer", "Procurement Officer"],
  issue_lpo: ["Procurement Officer", "Contracts Officer", "Head PDU"],
  accept_lpo: [],
  create_contract: ["Contracts Officer", "Procurement Officer", "Head PDU"],
  approve_contract: ["Accounting Officer", "Contracts Officer", "Head PDU"],
  sign_contract: ["Accounting Officer", "Contracts Officer"],
  issue_contract: ["Contracts Officer", "Procurement Officer", "Head PDU"],
  record_delivery: ["User Department Officer", "Head User Department"],
  record_inspection: ["Head User Department", "User Department Officer", "Contracts Officer"],
  // Invoices come from the provider (portal or auto-response), never from org users.
  create_invoice: [],
  certify_invoice: ["Head User Department", "Contracts Officer", "Finance/Budget Officer"],
  verify_invoice: ["Contracts Officer", "Finance/Budget Officer"],
  reject_invoice: ["Contracts Officer", "Finance/Budget Officer", "Head User Department"],
  create_payment: ["Finance/Budget Officer", "Accounting Officer", "Contracts Officer"],
  approve_payment: ["Accounting Officer"],
  mark_payment_paid: ["Finance/Budget Officer", "Accounting Officer"],
  reject_payment: ["Accounting Officer", "Finance/Budget Officer"],
  close_procurement: ["Contracts Officer", "Head PDU", "Procurement Officer", "Accounting Officer"],
  evaluate_closure: null, // any role with VIEW_PROCUREMENTS
  // Evaluation Committee membership is enforced inside the evaluation helpers.
  evaluation_context: null,
  save_evaluation: null,
  submit_evaluation: null,
  run_post_qualification: null,
  // PPDA: the Contracts Committee accepts or rejects the post-qualification outcome.
  decide_post_qualification: [],
};

/**
 * Lifecycle actions a committee seat may perform while that committee is the active
 * acting mode (PPDA committee functions). Org-role access above is unaffected.
 * @type {Record<string, string[]>}
 */
export const COMMITTEE_LIFECYCLE_AUTHORITY = {
  CONTRACTS: ["create_award", "cancel_award", "decide_post_qualification"],
  EVALUATION: ["evaluation_context", "save_evaluation", "submit_evaluation", "run_post_qualification"],
  INSPECTION_ACCEPTANCE: ["record_inspection"],
};

/**
 * @param {string} action
 * @param {string | null | undefined} committeeType
 */
export function committeeMayPerformLifecycleAction(action, committeeType) {
  const type = String(committeeType || "").toUpperCase();
  return Boolean(type && (COMMITTEE_LIFECYCLE_AUTHORITY[type] || []).includes(action));
}
