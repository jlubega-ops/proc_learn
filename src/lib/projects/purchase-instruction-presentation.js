/** @type {Record<string, { label: string; color: "success" | "warning" | "error" | "info" | "primary" }>} */
export const PI_STATUS_PRESENTATION = {
  DRAFT: { label: "Draft", color: "warning" },
  ISSUED: { label: "Awaiting provider acceptance", color: "warning" },
  ACCEPTED: { label: "Accepted by provider", color: "success" },
  DECLINED: { label: "Declined by provider", color: "error" },
};

/**
 * @param {string | null | undefined} status
 * @param {{ responseSource?: string | null }} [opts]
 */
export function presentPurchaseInstructionStatus(status, opts = {}) {
  const key = String(status || "");
  const base = PI_STATUS_PRESENTATION[key] || { label: key || "—", color: /** @type {"info"} */ ("info") };
  const src = opts.responseSource ? String(opts.responseSource) : "";
  const generated = Boolean(src && src !== "PORTAL");
  if (generated && (key === "ACCEPTED" || key === "DECLINED")) {
    return { ...base, label: `${base.label} - (Generated)` };
  }
  return base;
}

/** @type {Record<string, { label: string; color: "success" | "warning" | "error" | "info" | "primary" }>} */
export const DELIVERY_NOTE_STATUS_PRESENTATION = {
  SUBMITTED: { label: "Awaiting receipt", color: "warning" },
  RECEIVED: { label: "Received", color: "success" },
};
