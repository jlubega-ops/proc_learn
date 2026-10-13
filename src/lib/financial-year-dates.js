import { addYears, format, isValid, parseISO, subDays } from "date-fns";

/**
 * @param {Date} startDate
 */
export function fiscalYearEndFromStart(startDate) {
  return subDays(addYears(startDate, 1), 1);
}

/**
 * @param {unknown} value
 */
export function parseDateInputValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  // Prefer calendar Y-M-D so client/server TZ cannot shift the day.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (
      date.getUTCFullYear() !== y ||
      date.getUTCMonth() !== m - 1 ||
      date.getUTCDate() !== d
    ) {
      return null;
    }
    return date;
  }
  const parsed = parseISO(raw);
  return isValid(parsed) ? parsed : null;
}

/**
 * Calendar Y-M-D parts from a Date/@db.Date value (UTC — Prisma date columns).
 * @param {Date | string | null | undefined} value
 * @returns {{ y: number; m: number; d: number } | null}
 */
export function utcCalendarParts(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (match) {
      return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth(),
    d: date.getUTCDate(),
  };
}

/**
 * Server "today" as UTC calendar parts (do not use client local clock for status).
 * @param {Date} [now]
 */
export function serverUtcTodayParts(now = new Date()) {
  return {
    y: now.getUTCFullYear(),
    m: now.getUTCMonth(),
    d: now.getUTCDate(),
  };
}

/**
 * @param {{ y: number; m: number; d: number }} a
 * @param {{ y: number; m: number; d: number }} b
 */
export function compareUtcCalendarParts(a, b) {
  if (a.y !== b.y) return a.y < b.y ? -1 : 1;
  if (a.m !== b.m) return a.m < b.m ? -1 : 1;
  if (a.d !== b.d) return a.d < b.d ? -1 : 1;
  return 0;
}

/**
 * @param {Date | string | null | undefined} date
 */
export function toDateInputValue(date) {
  const parts = utcCalendarParts(date);
  if (!parts) return "";
  const mm = String(parts.m + 1).padStart(2, "0");
  const dd = String(parts.d).padStart(2, "0");
  return `${parts.y}-${mm}-${dd}`;
}

/**
 * Compact table label from a calendar date / YYYY-MM-DD (no TZ shift).
 * @param {unknown} value
 */
export function formatCalendarDateLabel(value) {
  const parts = utcCalendarParts(/** @type {any} */ (value));
  if (!parts) return "—";
  const date = new Date(parts.y, parts.m, parts.d);
  return format(date, "MMM d, yyyy");
}

/**
 * @param {Date} startDate
 */
export function suggestFinancialYearLabel(startDate) {
  const parts = utcCalendarParts(startDate);
  const y = parts?.y ?? startDate.getUTCFullYear();
  if (parts && parts.m === 0 && parts.d === 1) return String(y);
  return `${y}-${y + 1}`;
}

/**
 * "YYYY-YYYY" (spanning years) or "YYYY" (1 Jan – 31 Dec).
 * @param {unknown} label
 */
export function parseFinancialYearLabel(label) {
  const raw = String(label || "").trim();
  if (/^\d{4}$/.test(raw)) {
    const year = Number(raw);
    return { startYear: year, endYear: year, label: raw };
  }
  const match = /^(\d{4})-(\d{4})$/.exec(raw);
  if (!match) return null;
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) return null;
  if (endYear !== startYear + 1) return null;
  return { startYear, endYear, label: raw };
}

/**
 * @param {Date} left
 * @param {Date} right
 */
export function isSameCalendarDate(left, right) {
  return toDateInputValue(left) === toDateInputValue(right);
}
