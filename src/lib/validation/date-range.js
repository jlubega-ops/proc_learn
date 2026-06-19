import { parseDateInputValue, toDateInputValue } from "@/lib/financial-year-dates";

/** Shared copy for start/end date validation across the app. */
export const END_BEFORE_START_MESSAGE = "End date cannot be before the start date.";
export const START_AFTER_END_MESSAGE = "Start date cannot be after the end date.";

/** @param {unknown} value */
export function parseDateTimeLocalValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {Date | null | undefined} startDate
 * @param {Date | null | undefined} endDate
 */
export function isEndBeforeStart(startDate, endDate) {
  if (!startDate || !endDate) return false;
  return toDateInputValue(endDate) < toDateInputValue(startDate);
}

/**
 * @param {unknown} startRaw
 * @param {unknown} endRaw
 */
export function isDateTimeRangeInvalid(startRaw, endRaw) {
  const start = parseDateTimeLocalValue(startRaw);
  const end = parseDateTimeLocalValue(endRaw);
  if (!start || !end) return false;
  return end <= start;
}

/**
 * @param {unknown} startDateRaw
 * @param {unknown} endDateRaw
 * @param {{ requireBoth?: boolean; endLabel?: string; startLabel?: string }} [opts]
 */
export function validateStartEndDateRange(startDateRaw, endDateRaw, opts = {}) {
  const requireBoth = opts.requireBoth !== false;
  const endLabel = opts.endLabel || "End date";
  const startLabel = opts.startLabel || "Start date";
  /** @type {Record<string, string>} */
  const errors = {};

  const startDate = parseDateInputValue(startDateRaw);
  const endDate = parseDateInputValue(endDateRaw);

  if (requireBoth) {
    if (!startDate) errors.startDate = `${startLabel} is required.`;
    if (!endDate) errors.endDate = `${endLabel} is required.`;
  }

  if (startDate && endDate && isEndBeforeStart(startDate, endDate)) {
    errors.endDate = END_BEFORE_START_MESSAGE;
    errors.startDate = START_AFTER_END_MESSAGE;
  }

  const ok =
    Object.keys(errors).length === 0 &&
    (!requireBoth || (Boolean(startDate) && Boolean(endDate)));

  return { ok, errors, startDate, endDate };
}

/**
 * @param {unknown} startRaw
 * @param {unknown} endRaw
 * @param {{ endField?: string; startField?: string }} [opts]
 */
export function validateDateTimeRange(startRaw, endRaw, opts = {}) {
  const endField = opts.endField || "closeAt";
  const startField = opts.startField || "openAt";
  /** @type {Record<string, string>} */
  const errors = {};

  const start = parseDateTimeLocalValue(startRaw);
  const end = parseDateTimeLocalValue(endRaw);

  if (String(startRaw || "").trim() && !start) {
    errors[startField] = "Open date is invalid.";
  }
  if (String(endRaw || "").trim() && !end) {
    errors[endField] = "Close date is invalid.";
  }
  if (start && end && end <= start) {
    errors[endField] = "Close date must be after open date.";
    errors[startField] = "Open date must be before close date.";
  }

  return { ok: Object.keys(errors).length === 0, errors, start, end };
}

/**
 * Merge calendar date-range errors into a field map (client forms).
 * @param {Record<string, string>} errors
 * @param {unknown} startRaw
 * @param {unknown} endRaw
 * @param {string[]} [clearedKeys]
 */
export function mergeCalendarDateRangeErrors(errors, startRaw, endRaw, clearedKeys = []) {
  const next = { ...errors };
  for (const key of clearedKeys) delete next[key];
  delete next.startDate;
  delete next.endDate;

  const range = validateStartEndDateRange(startRaw, endRaw, { requireBoth: false });
  return { ...next, ...range.errors };
}

/**
 * @param {unknown} startRaw
 * @param {unknown} endRaw
 */
export function calendarDateInputConstraints(startRaw, endRaw) {
  const start = String(startRaw || "").trim();
  const end = String(endRaw || "").trim();
  return {
    startMax: end || undefined,
    endMin: start || undefined,
  };
}

/**
 * @param {unknown} startRaw
 * @param {unknown} endRaw
 */
export function dateTimeInputConstraints(startRaw, endRaw) {
  const start = String(startRaw || "").trim();
  const end = String(endRaw || "").trim();
  return {
    startMax: end || undefined,
    endMin: start || undefined,
  };
}
