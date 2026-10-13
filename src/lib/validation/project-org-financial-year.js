import {
  fiscalYearEndFromStart,
  isSameCalendarDate,
  parseDateInputValue,
  parseFinancialYearLabel,
  suggestFinancialYearLabel,
} from "@/lib/financial-year-dates";
import { END_BEFORE_START_MESSAGE, isEndBeforeStart, START_AFTER_END_MESSAGE } from "@/lib/validation/date-range";

/**
 * @param {unknown} value
 */
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @param {unknown} body
 */
export function validateProjectOrgFinancialYearInput(body) {
  /** @type {Record<string, string>} */
  const errors = {};

  const labelParsed = parseFinancialYearLabel(body?.label);
  if (!labelParsed) {
    errors.label = 'Use YYYY-YYYY (e.g. "2026-2027") or YYYY for a calendar year.';
  }

  const descriptionRaw = body?.description;
  const description =
    descriptionRaw === undefined || descriptionRaw === null
      ? null
      : cleanText(descriptionRaw) || null;
  if (description && description.length > 512) {
    errors.description = "Description is too long.";
  }

  const startDate = parseDateInputValue(body?.startDate);
  const endDate = parseDateInputValue(body?.endDate);

  if (!startDate) errors.startDate = "Start date is required.";
  if (!endDate) errors.endDate = "End date is required.";

  if (startDate && endDate) {
    if (isEndBeforeStart(startDate, endDate)) {
      errors.endDate = END_BEFORE_START_MESSAGE;
      errors.startDate = START_AFTER_END_MESSAGE;
    }
    const expectedEnd = fiscalYearEndFromStart(startDate);
    if (!isSameCalendarDate(endDate, expectedEnd)) {
      errors.endDate =
        "End date must be exactly one year after the start date (day before the anniversary).";
    }
  }

  if (labelParsed && startDate) {
    const suggested = suggestFinancialYearLabel(startDate);
    if (labelParsed.label !== suggested) {
      errors.label = `Use ${suggested} for the selected start date.`;
    }
  }

  const isActive = body?.isActive === false ? false : true;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (!labelParsed || !startDate || !endDate) {
    return { ok: false, errors: { _form: "Financial year details are incomplete." } };
  }

  return {
    ok: true,
    data: {
      label: labelParsed.label,
      description,
      startDate,
      endDate,
      isActive,
    },
  };
}

/**
 * @param {unknown} body
 * @param {{
 *   current?: {
 *     label: string;
 *     description: string | null;
 *     startDate: Date;
 *     endDate: Date;
 *     isActive: boolean;
 *   };
 * }} [opts]
 */
export function validateProjectOrgFinancialYearPatch(body, opts = {}) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<string, unknown>} */
  const data = {};
  const current = opts.current;

  if (body?.description !== undefined) {
    if (body.description === null) data.description = null;
    else {
      const description = cleanText(body.description) || null;
      if (description && description.length > 512) errors.description = "Description is too long.";
      else data.description = description;
    }
  }

  if (body?.isActive !== undefined) {
    data.isActive = body.isActive === false ? false : true;
  }

  const labelProvided = body?.label !== undefined;
  const startProvided = body?.startDate !== undefined;
  const endProvided = body?.endDate !== undefined;

  if (startProvided !== endProvided) {
    errors.startDate = "Provide both start and end dates when changing the period.";
    errors.endDate = "Provide both start and end dates when changing the period.";
  }

  if (labelProvided || startProvided || endProvided) {
    const label = labelProvided ? cleanText(body.label) : current?.label || "";
    const startDate = startProvided
      ? parseDateInputValue(body.startDate)
      : current?.startDate || null;
    const endDate = endProvided ? parseDateInputValue(body.endDate) : current?.endDate || null;

    const labelParsed = parseFinancialYearLabel(label);
    if (!labelParsed) {
      errors.label = 'Use YYYY-YYYY (e.g. "2026-2027") or YYYY for a calendar year.';
    }
    if (startProvided && !startDate) errors.startDate = "Start date is required.";
    if (endProvided && !endDate) errors.endDate = "End date is required.";

    if (startDate && endDate) {
      if (isEndBeforeStart(startDate, endDate)) {
        errors.endDate = END_BEFORE_START_MESSAGE;
        errors.startDate = START_AFTER_END_MESSAGE;
      }
      const expectedEnd = fiscalYearEndFromStart(startDate);
      if (!isSameCalendarDate(endDate, expectedEnd)) {
        errors.endDate =
          "End date must be exactly one year after the start date (day before the anniversary).";
      }
    }

    if (labelParsed && startDate) {
      const suggested = suggestFinancialYearLabel(startDate);
      if (labelParsed.label !== suggested) {
        errors.label = `Use ${suggested} for the selected start date.`;
      }
    }

    if (Object.keys(errors).length === 0 && labelParsed && startDate && endDate) {
      data.label = labelParsed.label;
      data.startDate = startDate;
      data.endDate = endDate;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (Object.keys(data).length === 0) {
    return { ok: false, errors: { _form: "No changes were provided." } };
  }
  return { ok: true, data };
}
