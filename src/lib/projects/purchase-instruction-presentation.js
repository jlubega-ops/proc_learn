/** @type {Record<string, { label: string; color: "success" | "warning" | "error" | "info" | "primary" }>} */
export const PI_STATUS_PRESENTATION = {
  DRAFT: { label: "Draft", color: "warning" },
  ISSUED: { label: "Awaiting provider acceptance", color: "warning" },
  ACCEPTED: { label: "Accepted by provider", color: "success" },
  DECLINED: { label: "Declined by provider", color: "error" },
};

/** @param {string | null | undefined} status */
export function presentPurchaseInstructionStatus(status) {
  return PI_STATUS_PRESENTATION[String(status || "")] || { label: String(status || "—"), color: "info" };
}

/** @type {Record<string, { label: string; color: "success" | "warning" | "error" | "info" | "primary" }>} */
export const DELIVERY_NOTE_STATUS_PRESENTATION = {
  SUBMITTED: { label: "Awaiting receipt", color: "warning" },
  RECEIVED: { label: "Received", color: "success" },
};
