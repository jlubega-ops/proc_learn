/**
 * Academic year labels for student intake, relative to a calendar reference date.
 * Primary pair for calendar year Y: `(Y-1)/Y` and `Y/(Y+1)`.
 * Three earlier pairs: `(Y-4)/(Y-3)` … `(Y-2)/(Y-1)`.
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
 * Same labels as {@link getAcademicYearChoices}, ordered **newest first** (highest start year) for dropdowns.
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
 * @param {string} label
 * @param {Date} [referenceDate]
 */
export function isAllowedAcademicYearLabel(label, referenceDate = new Date()) {
  const t = typeof label === "string" ? label.trim() : "";
  if (!/^\d{4}\/\d{4}$/.test(t)) return false;
  const allowed = new Set(getAcademicYearChoices(referenceDate).extended);
  return allowed.has(t);
}
