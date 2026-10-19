/**
 * PPDA Guideline No. 1 of 2025 — method value bands (UGX) by requirement category.
 * Engine methods remain MICRO / QUOTATION / TENDER; open/restricted bidding are Tender subtypes.
 * A more competitive method may be used below a ceiling; a method may not be used above it
 * (except Direct procurement mapped to Micro with justification — no threshold).
 */

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

/** Tender subtype labels (same Tender engine). */
export const TENDER_SUBTYPE_OPTIONS = [
  { value: "OPEN_DOMESTIC", label: "Open domestic bidding" },
  { value: "OPEN_INTERNATIONAL", label: "Open international bidding" },
  { value: "RESTRICTED_DOMESTIC", label: "Restricted domestic bidding" },
  { value: "RESTRICTED_INTERNATIONAL", label: "Restricted international bidding" },
];

/** @type {Record<string, string>} */
const TENDER_SUBTYPE_LEGACY = {
  "Open domestic bidding": "OPEN_DOMESTIC",
  "Open international bidding": "OPEN_INTERNATIONAL",
  "Restricted domestic bidding": "RESTRICTED_DOMESTIC",
  "Restricted international bidding": "RESTRICTED_INTERNATIONAL",
  OPEN: "OPEN_DOMESTIC",
  RESTRICTED: "RESTRICTED_DOMESTIC",
};

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTenderSubtype(value) {
  const t = String(value || "").trim();
  if (!t) return "";
  if (TENDER_SUBTYPE_OPTIONS.some((o) => o.value === t)) return t;
  return TENDER_SUBTYPE_LEGACY[t] || "";
}

/**
 * @param {string} value
 * @returns {string}
 */
export function tenderSubtypeLabel(value) {
  const key = normalizeTenderSubtype(value);
  return TENDER_SUBTYPE_OPTIONS.find((o) => o.value === key)?.label || "";
}

/**
 * Suggest open vs restricted from value (domestic default).
 * @param {unknown} estimatedValue
 * @param {string | null | undefined} categoryOrCircular
 */
export function suggestTenderSubtype(estimatedValue, categoryOrCircular) {
  const value = Number(estimatedValue ?? 0);
  const bands = bandsForThresholdCategory(categoryOrCircular);
  if (!Number.isFinite(value) || value <= 0) return "RESTRICTED_DOMESTIC";
  if (value > bands.restrictedMax) return "OPEN_DOMESTIC";
  return "RESTRICTED_DOMESTIC";
}

/**
 * @param {string | null | undefined} subtype
 * @param {unknown} estimatedValue
 * @param {string | null | undefined} categoryOrCircular
 * @returns {{ enabled: boolean; reason: string | null; recommended: boolean }}
 */
export function tenderSubtypeOptionState(subtype, estimatedValue, categoryOrCircular) {
  const key = normalizeTenderSubtype(subtype);
  const value = Number(estimatedValue ?? 0);
  const finite = Number.isFinite(value) && value > 0;
  const bands = bandsForThresholdCategory(categoryOrCircular);
  const isOpen = key.startsWith("OPEN_");
  const isRestricted = key.startsWith("RESTRICTED_");

  if (isRestricted) {
    const ok = !finite || value <= bands.restrictedMax;
    return {
      enabled: ok,
      reason: ok
        ? null
        : `Restricted bidding is for values up to ${formatUgx(bands.restrictedMax)}. Use open bidding.`,
      recommended: finite && value > bands.quotationMax && value <= bands.restrictedMax,
    };
  }
  if (isOpen) {
    return {
      enabled: true,
      reason: null,
      recommended: finite && value > bands.restrictedMax,
    };
  }
  return { enabled: true, reason: null, recommended: false };
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
  const allowDirect = Boolean(opts.allowDirectMicro);

  if (key === "MICRO") {
    const within = !finite || value <= bands.microMax;
    if (within) {
      return {
        enabled: true,
        reason: null,
        recommended: finite && value <= bands.microMax,
        directOnly: false,
      };
    }
    if (allowDirect) {
      return {
        enabled: true,
        reason: `Above Micro limit (${formatUgx(bands.microMax)}) — Direct procurement only.`,
        recommended: false,
        directOnly: true,
      };
    }
    return {
      enabled: false,
      reason: `Micro is limited to ${formatUgx(bands.microMax)} for this category.`,
      recommended: false,
      directOnly: false,
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
  if (key === "TENDER") {
    return {
      enabled: true,
      reason: null,
      recommended: finite && value > bands.quotationMax,
    };
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
  if (value <= bands.microMax) return "Micro procurement";
  if (value <= bands.quotationMax) return "Quotation";
  return "Tender";
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
  const mapped = planMethodToEnum(method) || String(method || "").toUpperCase();
  const value = Number(estimatedValue ?? 0);
  const bands = bandsForThresholdCategory(opts.category);
  const allowDirect = Boolean(opts.allowDirectMicro);

  if (mapped === "MICRO") {
    if (!Number.isFinite(value) || value <= bands.microMax) return { ok: true };
    if (allowDirect) return { ok: true };
    return {
      ok: false,
      ceiling: bands.microMax,
      error: `Micro procurement is limited to ${formatUgx(bands.microMax)} for this category. This value is ${formatUgx(value)} — use Quotation or Tender, or Direct procurement with justification.`,
    };
  }
  if (mapped === "QUOTATION") {
    if (!Number.isFinite(value) || value <= bands.quotationMax) return { ok: true };
    return {
      ok: false,
      ceiling: bands.quotationMax,
      error: `Quotation is limited to ${formatUgx(bands.quotationMax)} for this category. This value is ${formatUgx(value)} — recommend Tender instead.`,
    };
  }
  // Tender (and unknown): no upper ceiling
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
