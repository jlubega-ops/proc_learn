import { validateStartEndDateRange } from "@/lib/validation/date-range";

/**
 * @param {unknown} value
 */
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function optionalLabel(raw) {
  if (raw === undefined || raw === null) return null;
  const label = cleanText(raw);
  return label || null;
}

/**
 * @param {unknown} body
 */
export function validateProjectOrgPlanningPeriodInput(body) {
  /** @type {Record<string, string>} */
  const errors = {};

  const financialYearId = cleanText(body?.financialYearId);
  if (!financialYearId) errors.financialYearId = "Financial year is required.";

  const label = optionalLabel(body?.label);
  if (label && label.length > 128) errors.label = "Label is too long.";

  const range = validateStartEndDateRange(body?.startDate, body?.endDate);
  Object.assign(errors, range.errors);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (!range.startDate || !range.endDate) {
    return { ok: false, errors: { _form: "Planning period details are incomplete." } };
  }

  return {
    ok: true,
    data: {
      financialYearId,
      label,
      startDate: range.startDate,
      endDate: range.endDate,
    },
  };
}

/**
 * @param {unknown} body
 * @param {{
 *   current?: {
 *     financialYearId: string;
 *     label?: string | null;
 *     startDate: Date;
 *     endDate: Date;
 *   };
 * }} [opts]
 */
export function validateProjectOrgPlanningPeriodPatch(body, opts = {}) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<string, unknown>} */
  const data = {};
  const current = opts.current;

  if (body?.financialYearId !== undefined) {
    const financialYearId = cleanText(body.financialYearId);
    if (!financialYearId) errors.financialYearId = "Financial year is required.";
    else data.financialYearId = financialYearId;
  }

  if (body?.label !== undefined) {
    const label = optionalLabel(body.label);
    if (label && label.length > 128) errors.label = "Label is too long.";
    else data.label = label;
  }

  const startProvided = body?.startDate !== undefined;
  const endProvided = body?.endDate !== undefined;

  if (startProvided !== endProvided) {
    errors.startDate = "Provide both start and end dates when changing the period.";
    errors.endDate = "Provide both start and end dates when changing the period.";
  }

  if (startProvided || endProvided) {
    const startRaw = startProvided ? body.startDate : current?.startDate;
    const endRaw = endProvided ? body.endDate : current?.endDate;
    const range = validateStartEndDateRange(startRaw, endRaw);
    Object.assign(errors, range.errors);
    if (Object.keys(errors).length === 0 && range.startDate && range.endDate) {
      data.startDate = range.startDate;
      data.endDate = range.endDate;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (Object.keys(data).length === 0) {
    return { ok: false, errors: { _form: "No changes were provided." } };
  }
  return { ok: true, data };
}
