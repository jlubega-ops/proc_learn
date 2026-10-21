import { differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import {
  normalizeProviderCategories,
  normalizeProviderCategory,
  providerCategoryLabel,
} from "@/lib/projects/provider-terms";

/**
 * Simulated eligibility documents a Ugandan provider normally holds.
 * `hasExpiry` documents are only valid up to their expiry date.
 */
export const PROVIDER_DOCUMENTS = [
  {
    key: "URSB_REGISTRATION",
    label: "URSB certificate of incorporation / registration",
    shortLabel: "URSB registration",
    checkingLabel: "Checking URSB company registration…",
    hasExpiry: false,
    numberLabel: "Registration number",
  },
  {
    key: "TIN",
    label: "URA Taxpayer Identification Number (TIN)",
    shortLabel: "URA TIN",
    checkingLabel: "Checking URA TIN…",
    hasExpiry: false,
    numberLabel: "TIN",
  },
  {
    key: "TAX_CLEARANCE",
    label: "URA tax clearance certificate",
    shortLabel: "Tax clearance",
    checkingLabel: "Checking URA tax clearance…",
    hasExpiry: true,
    numberLabel: "Certificate number",
  },
  {
    key: "NSSF_CLEARANCE",
    label: "NSSF compliance / clearance certificate",
    shortLabel: "NSSF clearance",
    checkingLabel: "Checking NSSF compliance…",
    hasExpiry: true,
    numberLabel: "Certificate number",
  },
  {
    key: "PPDA_REGISTRATION",
    label: "PPDA Register of Providers",
    shortLabel: "PPDA registration",
    checkingLabel: "Checking PPDA Register of Providers…",
    hasExpiry: true,
    numberLabel: "PPDA registration number",
  },
  {
    key: "TRADING_LICENCE",
    label: "Trading licence (local government)",
    shortLabel: "Trading licence",
    checkingLabel: "Checking trading licence…",
    hasExpiry: true,
    numberLabel: "Licence number",
  },
  {
    key: "VAT_REGISTRATION",
    label: "VAT registration (where applicable)",
    shortLabel: "VAT registration",
    checkingLabel: "Checking VAT registration…",
    hasExpiry: false,
    numberLabel: "VAT number",
  },
];

const DOC_BY_KEY = Object.fromEntries(PROVIDER_DOCUMENTS.map((d) => [d.key, d]));

/** Context keys for which a requirement profile exists. */
export const QUALIFICATION_CONTEXT = {
  GENERAL: "GENERAL",
  MICRO: "MICRO",
  QUOTATION: "QUOTATION",
  BIDDING: "BIDDING",
  OTHER: "OTHER",
};

const FULL_SET = [
  "URSB_REGISTRATION",
  "TIN",
  "TRADING_LICENCE",
  "TAX_CLEARANCE",
  "NSSF_CLEARANCE",
  "PPDA_REGISTRATION",
];

/** Documents required per method (micro is lighter; competitive methods need the full set). */
const REQUIRED_DOCS = {
  GENERAL: FULL_SET,
  MICRO: ["URSB_REGISTRATION", "TIN", "TRADING_LICENCE"],
  QUOTATION: FULL_SET,
  BIDDING: FULL_SET,
  OTHER: FULL_SET,
};

/** Days before expiry at which a passing document is flagged as expiring soon. */
export const EXPIRY_WARNING_DAYS = 30;

/**
 * @param {unknown} value
 * @returns {string | null} YYYY-MM-DD
 */
function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isValid(value) ? format(value, "yyyy-MM-dd") : null;
  const s = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return isValid(parseISO(s)) ? s : null;
}

/**
 * @param {string} iso
 */
export function formatComplianceDate(iso) {
  const d = parseISO(iso);
  return isValid(d) ? format(d, "MMM d, yyyy") : iso;
}

/**
 * Canonical compliance map: { [docKey]: { held, number, expiresAt } } for every known document.
 * @param {unknown} raw
 */
export function normalizeProviderCompliance(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  /** @type {Record<string, { held: boolean; number: string | null; expiresAt: string | null }>} */
  const out = {};
  for (const doc of PROVIDER_DOCUMENTS) {
    const entry = /** @type {any} */ (src)[doc.key];
    const e = entry && typeof entry === "object" ? entry : {};
    const held = Boolean(e.held);
    const number = typeof e.number === "string" ? e.number.trim().slice(0, 64) || null : null;
    out[doc.key] = {
      held,
      number: held ? number : null,
      expiresAt: held && doc.hasExpiry ? toIsoDate(e.expiresAt) : null,
    };
  }
  return out;
}

/**
 * Field errors for a compliance payload (held documents with expiry need a valid date).
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function validateProviderCompliance(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  /** @type {Record<string, string>} */
  const errors = {};
  for (const doc of PROVIDER_DOCUMENTS) {
    const e = /** @type {any} */ (src)[doc.key];
    if (!e || !e.held || !doc.hasExpiry) continue;
    if (!toIsoDate(e.expiresAt)) {
      errors[`compliance.${doc.key}.expiresAt`] = "Enter the expiry date.";
    }
  }
  return errors;
}

/**
 * @param {unknown} method OrgProcurementMethod or context key
 */
export function qualificationContextForMethod(method) {
  const m = String(method || "").toUpperCase();
  if (Object.prototype.hasOwnProperty.call(REQUIRED_DOCS, m)) return m;
  // Official methods map onto MICRO / QUOTATION / BIDDING document profiles.
  if (m === "DIRECT") return QUALIFICATION_CONTEXT.MICRO;
  if (
    m === "OPEN_DOMESTIC" ||
    m === "OPEN_INTERNATIONAL" ||
    m === "RESTRICTED_DOMESTIC" ||
    m === "RESTRICTED_INTERNATIONAL" ||
    m === "TENDER"
  ) {
    return QUALIFICATION_CONTEXT.BIDDING;
  }
  return QUALIFICATION_CONTEXT.GENERAL;
}

/**
 * @param {unknown} method
 */
export function requiredDocumentsForMethod(method) {
  return REQUIRED_DOCS[qualificationContextForMethod(method)].map((k) => DOC_BY_KEY[k]);
}

/**
 * Deterministic eligibility check used by the register badge, pickers and the
 * "Run validation" checklist. Never blocks on its own — callers decide.
 *
 * @param {{
 *   status?: string | null;
 *   statusReason?: string | null;
 *   ppdaSuspended?: boolean | null;
 *   categories?: unknown;
 *   compliance?: unknown;
 * }} provider
 * @param {{ method?: string | null; category?: string | null; asOf?: Date | string | null }} [ctx]
 */
export function evaluateProviderQualification(provider, ctx = {}) {
  const asOfIso = toIsoDate(ctx.asOf || new Date()) || format(new Date(), "yyyy-MM-dd");
  const asOf = parseISO(asOfIso);
  const compliance = normalizeProviderCompliance(provider?.compliance);
  /** @type {{ key: string; label: string; checkingLabel: string; passed: boolean; warning: boolean; reason: string }[]} */
  const checks = [];

  const status = String(provider?.status || "ACTIVE");
  checks.push({
    key: "REGISTER_STATUS",
    label: "Active in the organisation's provider register",
    checkingLabel: "Checking organisation provider register…",
    passed: status === "ACTIVE",
    warning: false,
    reason:
      status === "ACTIVE"
        ? "Active"
        : status === "SUSPENDED"
          ? `Suspended by the PDU${provider?.statusReason ? `: ${provider.statusReason}` : ""}`
          : "Deactivated in the register",
  });

  for (const doc of requiredDocumentsForMethod(ctx.method)) {
    const e = compliance[doc.key];
    let passed = Boolean(e?.held);
    let warning = false;
    let reason = passed ? "Valid" : "Not provided";
    if (passed && doc.hasExpiry) {
      if (!e.expiresAt) {
        passed = false;
        reason = "No expiry date on record";
      } else {
        const days = differenceInCalendarDays(parseISO(e.expiresAt), asOf);
        if (days < 0) {
          passed = false;
          reason = `Expired ${formatComplianceDate(e.expiresAt)}`;
        } else if (days <= EXPIRY_WARNING_DAYS) {
          warning = true;
          reason = `Valid, expires ${formatComplianceDate(e.expiresAt)}`;
        } else {
          reason = `Valid until ${formatComplianceDate(e.expiresAt)}`;
        }
      }
    }
    checks.push({
      key: doc.key,
      label: doc.label,
      checkingLabel: doc.checkingLabel,
      passed,
      warning,
      reason,
    });
  }

  const suspended = Boolean(provider?.ppdaSuspended);
  checks.push({
    key: "PPDA_NOT_SUSPENDED",
    label: "Not on the PPDA suspended providers list",
    checkingLabel: "Checking PPDA suspended providers list…",
    passed: !suspended,
    warning: false,
    reason: suspended ? "Listed as suspended by PPDA" : "Not listed",
  });

  const wanted = normalizeProviderCategory(ctx.category);
  if (wanted) {
    const cats = normalizeProviderCategories(provider?.categories);
    const ok = cats.includes(wanted);
    checks.push({
      key: "CATEGORY_MATCH",
      label: `Registered for ${providerCategoryLabel(wanted).toLowerCase()}`,
      checkingLabel: "Checking provider category…",
      passed: ok,
      warning: false,
      reason: ok
        ? "Category matches"
        : `Registered for ${cats.map((c) => providerCategoryLabel(c)).join(", ") || "no category"}`,
    });
  }

  const failed = checks.filter((c) => !c.passed);
  return {
    qualifies: failed.length === 0,
    failedCount: failed.length,
    warningCount: checks.filter((c) => c.passed && c.warning).length,
    failedReasons: failed.map((c) => `${c.label}: ${c.reason}`),
    checks,
    context: qualificationContextForMethod(ctx.method),
    asOf: asOfIso,
  };
}
