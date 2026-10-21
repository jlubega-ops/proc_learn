/**
 * Official PPDA-style procurement methods (supplies, works, non-consultancy).
 * Each method is an independent engine process — enable/disable, scoring, and
 * templates are per method so one can change without affecting the others.
 *
 * Emergency is a plan circumstance, not a method (see EMERGENCY_PLANNING).
 * Process codes / triggers are plain strings (no import from process-catalogue) to avoid cycles.
 */

/** @typedef {"OPEN_DOMESTIC" | "OPEN_INTERNATIONAL" | "RESTRICTED_DOMESTIC" | "RESTRICTED_INTERNATIONAL" | "QUOTATION" | "MICRO" | "DIRECT"} OrgProcurementMethodCode */

/**
 * Stable enum values (Prisma `OrgProcurementMethod`).
 * @type {Readonly<Record<OrgProcurementMethodCode, OrgProcurementMethodCode>>}
 */
export const PROCUREMENT_METHODS = Object.freeze({
  OPEN_DOMESTIC: "OPEN_DOMESTIC",
  OPEN_INTERNATIONAL: "OPEN_INTERNATIONAL",
  RESTRICTED_DOMESTIC: "RESTRICTED_DOMESTIC",
  RESTRICTED_INTERNATIONAL: "RESTRICTED_INTERNATIONAL",
  QUOTATION: "QUOTATION",
  MICRO: "MICRO",
  DIRECT: "DIRECT",
});

/** @type {OrgProcurementMethodCode[]} */
export const PROCUREMENT_METHOD_CODES = Object.freeze([
  "OPEN_DOMESTIC",
  "OPEN_INTERNATIONAL",
  "RESTRICTED_DOMESTIC",
  "RESTRICTED_INTERNATIONAL",
  "QUOTATION",
  "MICRO",
  "DIRECT",
]);

/**
 * @typedef {{
 *   code: OrgProcurementMethodCode;
 *   shortCode: string;
 *   label: string;
 *   planLabel: string;
 *   whenToUse: string;
 *   keyRequirement: string;
 *   processCode: string;
 *   triggerKey: string;
 *   minimumBiddingWorkingDays: number;
 *   family: "BIDDING" | "QUOTATION" | "MICRO" | "DIRECT";
 *   usesContract: boolean;
 *   usesLpo: boolean;
 *   requiresPostQualificationDefault: boolean;
 *   requiresOpenAdvert: boolean;
 *   requiresShortlist: boolean;
 *   requiresDirectGrounds: boolean;
 *   thresholdBand: "micro" | "quotation" | "restricted" | "open" | "none";
 * }} ProcurementMethodDef
 */

/** @type {ProcurementMethodDef[]} */
export const PROCUREMENT_METHOD_CATALOGUE = [
  {
    code: "OPEN_DOMESTIC",
    shortCode: "ODB",
    label: "Open Domestic Bidding",
    planLabel: "Open Domestic Bidding",
    whenToUse:
      "Where open competition is appropriate and the procurement can attract sufficient competition from the domestic market.",
    keyRequirement: "The opportunity is publicly advertised domestically to invite eligible providers.",
    processCode: "OPEN_DOMESTIC_BIDDING",
    triggerKey: "OPEN_DOMESTIC_BIDDING_STARTED",
    minimumBiddingWorkingDays: 15,
    family: "BIDDING",
    usesContract: true,
    usesLpo: false,
    requiresPostQualificationDefault: true,
    requiresOpenAdvert: true,
    requiresShortlist: false,
    requiresDirectGrounds: false,
    thresholdBand: "open",
  },
  {
    code: "OPEN_INTERNATIONAL",
    shortCode: "OIB",
    label: "Open International Bidding",
    planLabel: "Open International Bidding",
    whenToUse:
      "Where open competition should extend to international providers (expertise, technology or market capacity may not be adequate domestically). Threshold alone does not decide domestic vs international.",
    keyRequirement: "The opportunity is advertised internationally in accordance with the applicable rules.",
    processCode: "OPEN_INTERNATIONAL_BIDDING",
    triggerKey: "OPEN_INTERNATIONAL_BIDDING_STARTED",
    minimumBiddingWorkingDays: 20,
    family: "BIDDING",
    usesContract: true,
    usesLpo: false,
    requiresPostQualificationDefault: true,
    requiresOpenAdvert: true,
    requiresShortlist: false,
    requiresDirectGrounds: false,
    thresholdBand: "open",
  },
  {
    code: "RESTRICTED_DOMESTIC",
    shortCode: "RDB",
    label: "Restricted Domestic Bidding",
    planLabel: "Restricted Domestic Bidding",
    whenToUse:
      "Where the value or circumstances do not justify or permit open bidding, and suitable domestic providers can be identified.",
    keyRequirement: "Eligible providers are invited directly without open advertisement.",
    processCode: "RESTRICTED_DOMESTIC_BIDDING",
    triggerKey: "RESTRICTED_DOMESTIC_BIDDING_STARTED",
    minimumBiddingWorkingDays: 10,
    family: "BIDDING",
    usesContract: true,
    usesLpo: false,
    requiresPostQualificationDefault: true,
    requiresOpenAdvert: false,
    requiresShortlist: true,
    requiresDirectGrounds: false,
    thresholdBand: "restricted",
  },
  {
    code: "RESTRICTED_INTERNATIONAL",
    shortCode: "RIB",
    label: "Restricted International Bidding",
    planLabel: "Restricted International Bidding",
    whenToUse:
      "Where the value or circumstances do not justify or permit open bidding, but the shortlist needs to include foreign providers.",
    keyRequirement: "Providers are invited directly without open advertisement, including foreign providers.",
    processCode: "RESTRICTED_INTERNATIONAL_BIDDING",
    triggerKey: "RESTRICTED_INTERNATIONAL_BIDDING_STARTED",
    minimumBiddingWorkingDays: 15,
    family: "BIDDING",
    usesContract: true,
    usesLpo: false,
    requiresPostQualificationDefault: true,
    requiresOpenAdvert: false,
    requiresShortlist: true,
    requiresDirectGrounds: false,
    thresholdBand: "restricted",
  },
  {
    code: "QUOTATION",
    shortCode: "QM",
    label: "Quotation Method",
    planLabel: "Quotation Method",
    whenToUse:
      "Where the estimated value or circumstances do not justify or permit open or restricted bidding, within the applicable threshold.",
    keyRequirement: "The PDE compares quotations to obtain competition and value for money.",
    processCode: "QUOTATION_PROCESS",
    triggerKey: "QUOTATION_STARTED",
    minimumBiddingWorkingDays: 5,
    family: "QUOTATION",
    usesContract: false,
    usesLpo: true,
    requiresPostQualificationDefault: false,
    requiresOpenAdvert: false,
    requiresShortlist: true,
    requiresDirectGrounds: false,
    thresholdBand: "quotation",
  },
  {
    code: "MICRO",
    shortCode: "MICRO",
    label: "Micro Procurement",
    planLabel: "Micro Procurement",
    whenToUse:
      "For very low-value requirements where the value does not justify a competitive procedure.",
    keyRequirement:
      "The PDE must still obtain value for money and comply with the micro-procurement rules, including quotation comparison where required.",
    processCode: "MICRO_PROCUREMENT",
    triggerKey: "MICRO_PROCUREMENT_STARTED",
    minimumBiddingWorkingDays: 0,
    family: "MICRO",
    usesContract: false,
    usesLpo: false,
    requiresPostQualificationDefault: false,
    requiresOpenAdvert: false,
    requiresShortlist: false,
    requiresDirectGrounds: false,
    thresholdBand: "micro",
  },
  {
    code: "DIRECT",
    shortCode: "DIRECT",
    label: "Direct Procurement",
    planLabel: "Direct Procurement",
    whenToUse:
      "Where exceptional circumstances prevent use of a competitive method (sole source, qualifying urgency, compatibility or continuity, or a permitted contract extension).",
    keyRequirement:
      "The PDE must establish and document the specific legal grounds. It must not use direct procurement merely for convenience or to avoid competition.",
    processCode: "DIRECT_PROCUREMENT",
    triggerKey: "DIRECT_PROCUREMENT_STARTED",
    minimumBiddingWorkingDays: 0,
    family: "DIRECT",
    usesContract: false,
    usesLpo: false,
    requiresPostQualificationDefault: false,
    requiresOpenAdvert: false,
    requiresShortlist: false,
    requiresDirectGrounds: true,
    thresholdBand: "none",
  },
];

/** Plan / Form 5 dropdown labels (official names). */
export const PROCUREMENT_METHOD_PLAN_OPTIONS = PROCUREMENT_METHOD_CATALOGUE.map((m) => m.planLabel);

const BY_CODE = new Map(PROCUREMENT_METHOD_CATALOGUE.map((m) => [m.code, m]));
const BY_PROCESS = new Map(PROCUREMENT_METHOD_CATALOGUE.map((m) => [m.processCode, m]));
const BY_LABEL = new Map(
  PROCUREMENT_METHOD_CATALOGUE.flatMap((m) => [
    [m.label.toLowerCase(), m],
    [m.planLabel.toLowerCase(), m],
    [m.shortCode.toLowerCase(), m],
    [m.code.toLowerCase(), m],
  ]),
);

/** Legacy plan / UI strings → official method code. */
const LEGACY_TO_METHOD = {
  micro: "MICRO",
  "micro procurement": "MICRO",
  quotation: "QUOTATION",
  "quotation method": "QUOTATION",
  "request for quotations": "QUOTATION",
  "open domestic bidding": "OPEN_DOMESTIC",
  "open international bidding": "OPEN_INTERNATIONAL",
  "restricted domestic bidding": "RESTRICTED_DOMESTIC",
  "restricted international bidding": "RESTRICTED_INTERNATIONAL",
  "direct procurement": "DIRECT",
  direct: "DIRECT",
  open_domestic: "OPEN_DOMESTIC",
  open_international: "OPEN_INTERNATIONAL",
  restricted_domestic: "RESTRICTED_DOMESTIC",
  restricted_international: "RESTRICTED_INTERNATIONAL",
};

/**
 * @param {string | null | undefined} code
 * @returns {ProcurementMethodDef | null}
 */
export function procurementMethodDef(code) {
  const key = String(code || "").trim().toUpperCase();
  return BY_CODE.get(/** @type {OrgProcurementMethodCode} */ (key)) || null;
}

/**
 * @param {string | null | undefined} processCode
 * @returns {ProcurementMethodDef | null}
 */
export function procurementMethodByProcessCode(processCode) {
  return BY_PROCESS.get(String(processCode || "").trim()) || null;
}

/**
 * Normalize a label or enum value to an official method code.
 *
 * @param {unknown} value
 * @param {{ directProcurement?: boolean }} [opts]
 * @returns {OrgProcurementMethodCode | ""}
 */
export function normalizeProcurementMethod(value, opts = {}) {
  const raw = String(value || "").trim();
  if (!raw) {
    if (opts.directProcurement) return "DIRECT";
    return "";
  }
  const upper = raw.toUpperCase().replace(/\s+/g, "_");
  if (BY_CODE.has(/** @type {OrgProcurementMethodCode} */ (upper))) {
    if (upper === "MICRO" && opts.directProcurement) return "DIRECT";
    return /** @type {OrgProcurementMethodCode} */ (upper);
  }

  const fromLegacy = LEGACY_TO_METHOD[raw.toLowerCase()] || LEGACY_TO_METHOD[upper.toLowerCase()];
  if (fromLegacy) {
    if (fromLegacy === "MICRO" && opts.directProcurement) return "DIRECT";
    return /** @type {OrgProcurementMethodCode} */ (fromLegacy);
  }

  const byLabel = BY_LABEL.get(raw.toLowerCase());
  if (byLabel) {
    if (byLabel.code === "MICRO" && opts.directProcurement) return "DIRECT";
    return byLabel.code;
  }

  return "";
}

/**
 * @param {string | null | undefined} code
 * @returns {string}
 */
export function procurementMethodLabel(code) {
  return procurementMethodDef(code)?.label || String(code || "").trim() || "—";
}

/**
 * @param {string | null | undefined} code
 * @returns {boolean}
 */
export function isBiddingMethod(code) {
  return procurementMethodDef(code)?.family === "BIDDING";
}

/**
 * @param {string | null | undefined} code
 * @returns {boolean}
 */
export function isQuotationMethod(code) {
  return procurementMethodDef(code)?.family === "QUOTATION";
}

/**
 * Micro or Direct — purchase-instruction path (no RFQ/bid competition).
 * @param {string | null | undefined} code
 */
export function isMicroStyleMethod(code) {
  const f = procurementMethodDef(code)?.family;
  return f === "MICRO" || f === "DIRECT";
}

/**
 * Competitive methods that solicit offers (quotation or bidding).
 * @param {string | null | undefined} code
 */
export function isCompetitiveMethod(code) {
  const f = procurementMethodDef(code)?.family;
  return f === "QUOTATION" || f === "BIDDING";
}

/**
 * @param {string | null | undefined} code
 * @returns {boolean}
 */
export function methodRequiresShortlist(code) {
  return Boolean(procurementMethodDef(code)?.requiresShortlist);
}

/**
 * @param {string | null | undefined} code
 * @returns {boolean}
 */
export function methodRequiresDirectGrounds(code) {
  return Boolean(procurementMethodDef(code)?.requiresDirectGrounds);
}

/**
 * @param {string | null | undefined} code
 * @returns {boolean}
 */
export function methodUsesOpenAdvert(code) {
  return Boolean(procurementMethodDef(code)?.requiresOpenAdvert);
}

/**
 * @param {string | null | undefined} code
 * @returns {boolean}
 */
export function methodUsesContract(code) {
  return Boolean(procurementMethodDef(code)?.usesContract);
}

/**
 * @param {string | null | undefined} code
 * @returns {boolean}
 */
export function methodUsesLpo(code) {
  return Boolean(procurementMethodDef(code)?.usesLpo);
}

/**
 * @param {string | null | undefined} code
 * @returns {number}
 */
export function methodMinimumBiddingWorkingDays(code) {
  return procurementMethodDef(code)?.minimumBiddingWorkingDays ?? 0;
}

/**
 * Map method → process start meta (independent engines).
 * @type {Record<string, { code: string; triggerKey: string; label: string }>}
 */
export const METHOD_PROCESS_BY_METHOD = Object.fromEntries(
  PROCUREMENT_METHOD_CATALOGUE.map((m) => [
    m.code,
    { code: m.processCode, triggerKey: m.triggerKey, label: m.label },
  ]),
);

/** Process codes that count as “a procurement method” for programme / scoring. */
export const METHOD_PROCESS_CODES = Object.freeze(
  PROCUREMENT_METHOD_CATALOGUE.map((m) => m.processCode),
);

/**
 * @param {string | null | undefined} method
 * @returns {{ code: string; triggerKey: string; label: string } | null}
 */
export function methodProcessMeta(method) {
  const key = normalizeProcurementMethod(method);
  if (!key) return null;
  return METHOD_PROCESS_BY_METHOD[key] || null;
}
