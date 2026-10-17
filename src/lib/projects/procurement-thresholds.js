/**
 * PPDA method ceilings (UGX, supplies / non-consultancy services) used by the simulator.
 * A more competitive method may always be used below a ceiling; a method may not be used above it.
 */
export const METHOD_VALUE_CEILINGS_UGX = {
  MICRO: 10_000_000,
};

/** Providers an RFQ must go to; fewer only with a recorded justification. */
export const MIN_RFQ_PROVIDERS = 3;

/** Emergency situations allow a shortlist of at least two (Rules and Methods Regulations 2023, reg. 7(6)). */
export const MIN_RFQ_PROVIDERS_EMERGENCY = 2;

/** @param {boolean | null | undefined} isEmergency */
export function minRfqProviders(isEmergency) {
  return isEmergency ? MIN_RFQ_PROVIDERS_EMERGENCY : MIN_RFQ_PROVIDERS;
}

/**
 * @param {string | null | undefined} method
 * @returns {"MICRO" | "QUOTATION" | "TENDER" | ""}
 */
export function planMethodToEnum(method) {
  const t = String(method || "").trim().toLowerCase();
  if (!t) return "";
  if (t === "micro" || t.includes("micro")) return "MICRO";
  if (t === "quotation" || t.includes("quotation") || t.includes("rfq")) return "QUOTATION";
  if (t === "tender" || t.includes("bidding") || t.includes("tender")) return "TENDER";
  return "";
}

/**
 * Whether a planned / recommended method is allowed for an estimated value.
 * Micro is disabled above the MICRO ceiling; Quotation and Tender stay available.
 *
 * @param {string | null | undefined} methodLabel e.g. "Micro procurement"
 * @param {unknown} estimatedValue
 * @returns {{ enabled: boolean; reason: string | null; recommended: boolean }}
 */
export function planMethodOptionState(methodLabel, estimatedValue) {
  const key = planMethodToEnum(methodLabel);
  const value = Number(estimatedValue ?? 0);
  const finite = Number.isFinite(value) && value > 0;
  const microCeiling = METHOD_VALUE_CEILINGS_UGX.MICRO;
  const microAllowed = !finite || value <= microCeiling;

  if (key === "MICRO") {
    return {
      enabled: microAllowed,
      reason: microAllowed
        ? null
        : `Micro is limited to UGX ${microCeiling.toLocaleString("en-US")}.`,
      recommended: finite && value <= microCeiling,
    };
  }
  if (key === "QUOTATION") {
    return {
      enabled: true,
      reason: null,
      recommended: finite && value > microCeiling,
    };
  }
  if (key === "TENDER") {
    return {
      enabled: true,
      reason: null,
      recommended: false,
    };
  }
  return { enabled: true, reason: null, recommended: false };
}

/**
 * Suggest a plan method label from estimated total.
 * @param {unknown} estimatedValue
 * @returns {string}
 */
export function suggestPlanMethodLabel(estimatedValue) {
  const value = Number(estimatedValue ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value <= METHOD_VALUE_CEILINGS_UGX.MICRO) return "Micro procurement";
  return "Quotation";
}

/**
 * @param {string | null | undefined} method
 * @param {unknown} estimatedValue
 * @returns {{ ok: true } | { ok: false; error: string; ceiling: number }}
 */
export function checkMethodValueCeiling(method, estimatedValue) {
  const key = String(method || "").toUpperCase();
  const mapped = planMethodToEnum(method) || key;
  const ceiling = METHOD_VALUE_CEILINGS_UGX[mapped] || METHOD_VALUE_CEILINGS_UGX[key];
  const value = Number(estimatedValue ?? 0);
  if (!ceiling || !Number.isFinite(value) || value <= ceiling) return { ok: true };
  return {
    ok: false,
    ceiling,
    error: `${mapped || key} procurement is limited to UGX ${ceiling.toLocaleString("en-US")}. This requisition is UGX ${value.toLocaleString("en-US")} — recommend QUOTATION or TENDER instead.`,
  };
}
