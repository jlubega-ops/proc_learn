/** PDU → Contracts Committee recommendation kinds. */
export const RECOMMENDATION_KIND = {
  CANCEL: "CANCEL",
  CHANGE_PROVIDER: "CHANGE_PROVIDER",
};

export const RECOMMENDATION_KIND_LABELS = {
  CANCEL: "Cancel procurement",
  CHANGE_PROVIDER: "Change provider",
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

/** @param {string | null | undefined} kind */
export function recommendationReasons(kind) {
  return kind === RECOMMENDATION_KIND.CHANGE_PROVIDER ? CHANGE_PROVIDER_REASONS : CANCEL_REASONS;
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

/** Title prefix of the Contracts Committee decision task. */
export const RECOMMENDATION_TASK_PREFIX = "Decide PDU recommendation";

/** @param {string | null | undefined} title */
export function isRecommendationDecisionTask(title) {
  return String(title || "").trim().toLowerCase().startsWith(RECOMMENDATION_TASK_PREFIX.toLowerCase());
}
