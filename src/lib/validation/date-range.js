import { parseDateInputValue, toDateInputValue } from "@/lib/financial-year-dates";

/** Shared copy for start/end date validation across the app. */
export const END_BEFORE_START_MESSAGE = "End date cannot be before the start date.";

/**
 * @param {Date | null | undefined} startDate
 * @param {Date | null | undefined} endDate
 */
export function isEndBeforeStart(startDate, endDate) {
  if (!startDate || !endDate) return false;
  return toDateInputValue(endDate) < toDateInputValue(startDate);
}

/**
 * @param {unknown} startDateRaw
 * @param {unknown} endDateRaw
 * @param {{ requireBoth?: boolean }} [opts]
 */
export function validateStartEndDateRange(startDateRaw, endDateRaw, opts = {}) {
  const requireBoth = opts.requireBoth !== false;
  /** @type {Record<string, string>} */
  const errors = {};

  const startDate = parseDateInputValue(startDateRaw);
  const endDate = parseDateInputValue(endDateRaw);

  if (requireBoth) {
    if (!startDate) errors.startDate = "Start date is required.";
    if (!endDate) errors.endDate = "End date is required.";
  }

  if (startDate && endDate && isEndBeforeStart(startDate, endDate)) {
    errors.endDate = END_BEFORE_START_MESSAGE;
  }

  const ok =
    Object.keys(errors).length === 0 &&
    (!requireBoth || (Boolean(startDate) && Boolean(endDate)));

  return { ok, errors, startDate, endDate };
}
