/** PDU → Contracts Committee recommendation kinds. */
export const RECOMMENDATION_KIND = {
  CANCEL: "CANCEL",
  CHANGE_PROVIDER: "CHANGE_PROVIDER",
  CHANGE_SHORTLIST: "CHANGE_SHORTLIST",
};

export const RECOMMENDATION_KIND_LABELS = {
  CANCEL: "Cancel procurement",
  CHANGE_PROVIDER: "Change provider",
  CHANGE_SHORTLIST: "Change shortlist",
};

/** The only grounds for cancelling a procurement (PPDA PDE Regulations 2023, reg. 14(3)). */
export const CANCEL_REASONS = [
  { value: "INADEQUATE_FUNDING", label: "Lack of adequate funding" },
  { value: "TECHNICAL_CHANGE", label: "Significant change in technical details" },
  { value: "CIRCUMSTANCE_CHANGE", label: "Significant change in circumstances" },
];

export const CHANGE_PROVIDER_REASONS = [
  { value: "PROVIDER_DECLINED", label: "Provider declined or cannot supply" },
  { value: "PROVIDER_INELIGIBLE", label: "Provider no longer eligible" },
  { value: "PRICE_NOT_VALID", label: "Quoted price no longer valid" },
  { value: "OTHER", label: "Other" },
];

export const CHANGE_SHORTLIST_REASONS = [
  { value: "PROVIDER_DECLINED", label: "Shortlisted provider declined or cannot supply" },
  { value: "PROVIDER_INELIGIBLE", label: "Shortlisted provider no longer eligible" },
  { value: "INSUFFICIENT_COMPETITION", label: "Too few providers for competition" },
  { value: "OTHER", label: "Other" },
];

/** @param {string | null | undefined} kind */
export function recommendationReasons(kind) {
  if (kind === RECOMMENDATION_KIND.CHANGE_PROVIDER) return CHANGE_PROVIDER_REASONS;
  if (kind === RECOMMENDATION_KIND.CHANGE_SHORTLIST) return CHANGE_SHORTLIST_REASONS;
  return CANCEL_REASONS;
}

/**
 * @param {string | null | undefined} kind
 * @param {string | null | undefined} reason
 */
export function recommendationReasonLabel(kind, reason) {
  return recommendationReasons(kind).find((r) => r.value === reason)?.label || reason || "—";
}

export const RECOMMENDATION_STATUS_PRESENTATION = {
  PENDING: { label: "Pending Contracts Committee", color: "warning" },
  APPROVED: { label: "Approved", color: "success" },
  DECLINED: { label: "Declined", color: "error" },
};

/**
 * Button / dialog label for what the PDU may recommend at this stage. The decision always rests
 * with the Contracts Committee, whichever role or committee acted last.
 * @param {string[] | null | undefined} kinds
 */
export function recommendActionLabel(kinds) {
  const list = Array.isArray(kinds) ? kinds : [];
  if (list.includes(RECOMMENDATION_KIND.CHANGE_PROVIDER)) return "Recommend cancellation or provider change";
  if (list.includes(RECOMMENDATION_KIND.CHANGE_SHORTLIST)) return "Recommend cancellation or shortlist change";
  return "Recommend cancellation";
}

/** PDU roles that hold the case and may recommend to the Contracts Committee. */
export const RECOMMEND_ROLES = ["Head PDU", "Procurement Officer"];

/** @param {string | null | undefined} roleName */
export function mayRecommendToContractsCommittee(roleName) {
  return RECOMMEND_ROLES.includes(String(roleName || "").trim());
}

/** Review / approval steps that may send the work back one step for correction. */
const RETURNABLE_STEP_RE =
  /^(review|approve) (rfq|tender) documents|^review evaluation report|^approve evaluation report|^approve evaluation\/recommendation/i;

/**
 * True when Return (back one step) is available on this procurement task.
 * @param {string | null | undefined} title task title, "<step>: …"
 */
export function procurementStepReturnable(title) {
  return RETURNABLE_STEP_RE.test(String(title || "").split(":")[0].trim());
}

/** Title prefix of the Contracts Committee decision task. */
export const RECOMMENDATION_TASK_PREFIX = "Decide PDU recommendation";

/** @param {string | null | undefined} title */
export function isRecommendationDecisionTask(title) {
  return String(title || "").trim().toLowerCase().startsWith(RECOMMENDATION_TASK_PREFIX.toLowerCase());
}
