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
  const d = parseISO(raw);
  return isValid(d) ? d : null;
}

/**
 * @param {Date} date
 */
export function toDateInputValue(date) {
  return format(date, "yyyy-MM-dd");
}

/**
 * @param {Date} startDate
 */
export function suggestFinancialYearLabel(startDate) {
  const y = startDate.getFullYear();
  return `${y}-${y + 1}`;
}

/**
 * @param {unknown} label
 */
export function parseFinancialYearLabel(label) {
  const raw = String(label || "").trim();
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
