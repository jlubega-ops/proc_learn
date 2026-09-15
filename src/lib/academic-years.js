/**
 * Academic year label helpers.
 * Student forms and imports use only years that exist in AcademicYear (admin setup).
 * Calendar-derived helpers remain for bootstrap when no year exists yet.
 */

/**
 * Suggest label for calendar year Y (used only when seeding/bootstrapping).
 * @param {Date} [referenceDate]
 * @returns {{ primary: string[]; extended: string[] }}
 */
export function getAcademicYearChoices(referenceDate = new Date()) {
  const y = referenceDate.getFullYear();
  const pair = (/** @type {number} */ a) => `${a}/${a + 1}`;
  const primary = [pair(y - 1), pair(y)];
  const previous = [pair(y - 4), pair(y - 3), pair(y - 2)];
  const extended = [...previous, ...primary];
  return { primary, extended };
}

/**
 * @param {Date} [referenceDate]
 */
export function getAcademicYearDropdownChoices(referenceDate = new Date()) {
  const { primary, extended } = getAcademicYearChoices(referenceDate);
  return {
    primary: [...primary].reverse(),
    extended: [...extended].reverse(),
  };
}

/**
 * Label shape YYYY/YYYY+1 (does not check the database).
 * @param {unknown} label
 */
export function isAcademicYearLabelShape(label) {
  const t = typeof label === "string" ? label.trim() : "";
  return /^\d{4}\/\d{4}$/.test(t);
}

/**
 * @deprecated Prefer {@link isRegisteredAcademicYearLabel} from academic-context (DB-backed).
 * Kept for bootstrap-only callers that still need a calendar window check.
 */
export function isAllowedAcademicYearLabel(label, referenceDate = new Date()) {
  const t = typeof label === "string" ? label.trim() : "";
  if (!isAcademicYearLabelShape(t)) return false;
  const allowed = new Set(getAcademicYearChoices(referenceDate).extended);
  return allowed.has(t);
}
