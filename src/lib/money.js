/**
 * Money helpers — default org currency is UGX; display with comma thousands separators.
 */

export const DEFAULT_CURRENCY = "UGX";

/**
 * Strip commas / spaces / currency letters for parsing.
 * @param {string | number | null | undefined} value
 */
export function parseMoneyInput(value) {
  if (value != null && typeof value === "object") {
    // Prisma Decimal / similar
    if (typeof value.toString === "function") {
      value = value.toString();
    } else if ("d" in /** @type {any} */ (value)) {
      value = String(/** @type {any} */ (value));
    }
  }
  return String(value ?? "")
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .replace(/[A-Za-z]/g, "")
    .trim();
}

/**
 * @param {string | number | null | undefined} value
 * @returns {number | null}
 */
export function toMoneyNumber(value) {
  const raw = parseMoneyInput(value);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Format a numeric amount with commas (no currency prefix).
 * @param {string | number | null | undefined} value
 * @param {{ maxFractionDigits?: number }} [opts]
 */
export function formatMoneyAmount(value, opts = {}) {
  const maxFractionDigits = opts.maxFractionDigits ?? 2;
  const n = toMoneyNumber(value);
  if (n === null) {
    const raw = String(value ?? "").trim();
    return raw || "";
  }
  return n.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : Math.min(2, maxFractionDigits),
    maximumFractionDigits: maxFractionDigits,
  });
}

/**
 * Format for display with currency, e.g. "UGX 1,000,000".
 * @param {string | number | null | undefined} value
 * @param {{ currency?: string; empty?: string }} [opts]
 */
export function formatMoneyUGX(value, opts = {}) {
  const currency = opts.currency || DEFAULT_CURRENCY;
  const empty = opts.empty ?? "—";
  const amount = formatMoneyAmount(value);
  if (!amount) return empty;
  return `${currency} ${amount}`;
}

/**
 * Validate a positive money field (required).
 * @param {string | number | null | undefined} value
 * @param {string} [label]
 * @returns {string | null} error message or null
 */
export function validatePositiveMoney(value, label = "Amount") {
  const raw = parseMoneyInput(value);
  if (!raw) return `Enter a ${label.toLowerCase()}.`;
  const n = Number(raw);
  if (!Number.isFinite(n)) return `Enter a valid ${label.toLowerCase()}.`;
  if (n <= 0) return `${label} must be greater than zero.`;
  return null;
}

/**
 * Validate a positive quantity / numeric (required).
 * @param {string | number | null | undefined} value
 * @param {string} [label]
 * @returns {string | null}
 */
export function validatePositiveNumber(value, label = "Quantity") {
  const raw = parseMoneyInput(value);
  if (!raw) return `Enter a ${label.toLowerCase()}.`;
  const n = Number(raw);
  if (!Number.isFinite(n)) return `Enter a valid ${label.toLowerCase()}.`;
  if (n <= 0) return `${label} must be greater than zero.`;
  return null;
}

/**
 * Line total from qty × unit price (comma-safe).
 * @param {string | number} quantity
 * @param {string | number} unitPrice
 */
export function computeLineTotal(quantity, unitPrice) {
  const q = toMoneyNumber(quantity);
  const p = toMoneyNumber(unitPrice);
  if (q === null || p === null) return null;
  return q * p;
}
