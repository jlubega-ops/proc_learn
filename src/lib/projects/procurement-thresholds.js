/**
 * PPDA Guideline No. 1 of 2025 — method value bands (UGX) by requirement category.
 * Seven independent methods (see procurement-methods.js). Direct has no upper threshold
 * but requires documented legal grounds.
 */

import {
  isBiddingMethod,
  normalizeProcurementMethod,
  procurementMethodLabel,
} from "@/lib/projects/procurement-methods";

/** @deprecated Prefer {@link bandsForThresholdCategory} — supplies Micro max for older callers. */
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
 * Threshold category keys (Guideline 1/2025 sections).
 * @typedef {"WORKS" | "SUPPLIES" | "CONSULTANCY_FIRM" | "CONSULTANCY_INDIVIDUAL"} ThresholdCategory
 */

/** @type {Record<ThresholdCategory, { microMax: number; quotationMax: number; restrictedMax: number }>} */
export const THRESHOLD_BANDS_UGX = {
  WORKS: {
    microMax: 20_000_000,
    quotationMax: 400_000_000,
    restrictedMax: 800_000_000,
  },
  SUPPLIES: {
    microMax: 10_000_000,
    quotationMax: 200_000_000,
    restrictedMax: 400_000_000,
  },
  CONSULTANCY_FIRM: {
    microMax: 10_000_000,
    quotationMax: 200_000_000,
    restrictedMax: 400_000_000,
  },
  CONSULTANCY_INDIVIDUAL: {
    microMax: 10_000_000,
    quotationMax: 100_000_000,
    restrictedMax: 200_000_000,
  },
};

/**
 * Map Circular sheet / requisition category to a threshold table.
 * @param {string | null | undefined} categoryOrCircular
 * @returns {ThresholdCategory}
 */
export function resolveThresholdCategory(categoryOrCircular) {
  const t = String(categoryOrCircular || "")
    .trim()
    .toLowerCase();
  if (!t) return "SUPPLIES";
  if (t.includes("individual")) return "CONSULTANCY_INDIVIDUAL";
  if (t.includes("consultanc")) return "CONSULTANCY_FIRM";
  if (t === "works" || (t.includes("works") && !t.includes("goods"))) return "WORKS";
  return "SUPPLIES";
}

/**
 * @param {string | null | undefined} categoryOrCircular
 */
export function bandsForThresholdCategory(categoryOrCircular) {
  const key = resolveThresholdCategory(categoryOrCircular);
  return THRESHOLD_BANDS_UGX[key] || THRESHOLD_BANDS_UGX.SUPPLIES;
}

/**
 * @param {number} n
 */
function formatUgx(n) {
  return `UGX ${Number(n).toLocaleString("en-US")}`;
}

/**
 * @param {string | null | undefined} method
 * @param {{ directProcurement?: boolean }} [opts]
 * @returns {string} Official OrgProcurementMethod code or ""
 */
export function planMethodToEnum(method, opts = {}) {
  return normalizeProcurementMethod(method, opts);
}

/**
 * Whether a planned / recommended method is allowed for an estimated value + category.
 *
 * @param {string | null | undefined} methodLabel e.g. "Micro procurement" or "MICRO"
 * @param {unknown} estimatedValue
 * @param {string | null | undefined} [categoryOrCircular]
 * @param {{ allowDirectMicro?: boolean }} [opts] Form 5: Micro above ceiling as Direct
 * @returns {{ enabled: boolean; reason: string | null; recommended: boolean; directOnly?: boolean }}
 */
export function planMethodOptionState(methodLabel, estimatedValue, categoryOrCircular, opts = {}) {
  const key = planMethodToEnum(methodLabel);
  const value = Number(estimatedValue ?? 0);
  const finite = Number.isFinite(value) && value > 0;
  const bands = bandsForThresholdCategory(categoryOrCircular);

  if (key === "MICRO") {
    const within = !finite || value <= bands.microMax;
    return {
      enabled: within,
      reason: within ? null : `Micro is limited to ${formatUgx(bands.microMax)} for this category.`,
      recommended: finite && value <= bands.microMax,
      directOnly: false,
    };
  }
  if (key === "DIRECT") {
    return {
      enabled: true,
      reason: null,
      recommended: false,
      directOnly: true,
    };
  }
  if (key === "QUOTATION") {
    const ok = !finite || value <= bands.quotationMax;
    return {
      enabled: ok,
      reason: ok
        ? null
        : `Quotation is limited to ${formatUgx(bands.quotationMax)} for this category.`,
      recommended: finite && value > bands.microMax && value <= bands.quotationMax,
    };
  }
  if (key === "RESTRICTED_DOMESTIC" || key === "RESTRICTED_INTERNATIONAL") {
    const ok = !finite || value <= bands.restrictedMax;
    return {
      enabled: ok,
      reason: ok
        ? null
        : `Restricted bidding is for values up to ${formatUgx(bands.restrictedMax)}. Use open bidding.`,
      recommended: finite && value > bands.quotationMax && value <= bands.restrictedMax,
    };
  }
  if (key === "OPEN_DOMESTIC" || key === "OPEN_INTERNATIONAL") {
    return {
      enabled: true,
      reason: null,
      recommended: finite && value > bands.restrictedMax,
    };
  }
  if (isBiddingMethod(key)) {
    return { enabled: true, reason: null, recommended: finite && value > bands.quotationMax };
  }
  return { enabled: true, reason: null, recommended: false };
}

/**
 * Suggest a plan method label from estimated total + category.
 * @param {unknown} estimatedValue
 * @param {string | null | undefined} [categoryOrCircular]
 * @returns {string}
 */
export function suggestPlanMethodLabel(estimatedValue, categoryOrCircular) {
  const value = Number(estimatedValue ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  const bands = bandsForThresholdCategory(categoryOrCircular);
  if (value <= bands.microMax) return procurementMethodLabel("MICRO");
  if (value <= bands.quotationMax) return procurementMethodLabel("QUOTATION");
  if (value <= bands.restrictedMax) return procurementMethodLabel("RESTRICTED_DOMESTIC");
  return procurementMethodLabel("OPEN_DOMESTIC");
}

/**
 * @param {string | null | undefined} method
 * @param {unknown} estimatedValue
 * @param {{
 *   category?: string | null;
 *   allowDirectMicro?: boolean;
 * }} [opts]
 * @returns {{ ok: true } | { ok: false; error: string; ceiling: number }}
 */
export function checkMethodValueCeiling(method, estimatedValue, opts = {}) {
  const mapped = planMethodToEnum(method, {
    directProcurement: opts.allowDirectMicro || opts.directProcurement,
  });
  const value = Number(estimatedValue ?? 0);
  const bands = bandsForThresholdCategory(opts.category);

  if (mapped === "MICRO") {
    if (!Number.isFinite(value) || value <= bands.microMax) return { ok: true };
    return {
      ok: false,
      ceiling: bands.microMax,
      error: `Micro Procurement is limited to ${formatUgx(bands.microMax)} for this category. This value is ${formatUgx(value)} — use Quotation, a bidding method, or Direct Procurement with justification.`,
    };
  }
  if (mapped === "QUOTATION") {
    if (!Number.isFinite(value) || value <= bands.quotationMax) return { ok: true };
    return {
      ok: false,
      ceiling: bands.quotationMax,
      error: `Quotation Method is limited to ${formatUgx(bands.quotationMax)} for this category. This value is ${formatUgx(value)} — recommend restricted or open bidding.`,
    };
  }
  if (mapped === "RESTRICTED_DOMESTIC" || mapped === "RESTRICTED_INTERNATIONAL") {
    if (!Number.isFinite(value) || value <= bands.restrictedMax) return { ok: true };
    return {
      ok: false,
      ceiling: bands.restrictedMax,
      error: `Restricted bidding is limited to ${formatUgx(bands.restrictedMax)} for this category. This value is ${formatUgx(value)} — use open bidding.`,
    };
  }
  // Open bidding, Direct, unknown: no upper ceiling (Direct still needs grounds elsewhere)
  return { ok: true };
}

/**
 * Whether Micro at this value must be treated as Direct (above Micro band).
 * @param {unknown} estimatedValue
 * @param {string | null | undefined} categoryOrCircular
 */
export function microRequiresDirect(estimatedValue, categoryOrCircular) {
  const value = Number(estimatedValue ?? 0);
  if (!Number.isFinite(value) || value <= 0) return false;
  return value > bandsForThresholdCategory(categoryOrCircular).microMax;
}
