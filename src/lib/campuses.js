/**
 * MUBS campuses for student attachment and filters.
 * Default filter in lists is “all” (empty string) — never invent a campus on filter alone.
 */

export const CAMPUS = {
  MAIN: "MAIN",
  ARUA: "ARUA",
  MBARARA: "MBARARA",
  JINJA: "JINJA",
  MBALE: "MBALE",
};

/** @type {readonly string[]} */
export const CAMPUS_VALUES = Object.freeze([
  CAMPUS.MAIN,
  CAMPUS.ARUA,
  CAMPUS.MBARARA,
  CAMPUS.JINJA,
  CAMPUS.MBALE,
]);

/** @type {Record<string, string>} */
export const CAMPUS_LABELS = {
  [CAMPUS.MAIN]: "Main",
  [CAMPUS.ARUA]: "Arua",
  [CAMPUS.MBARARA]: "Mbarara",
  [CAMPUS.JINJA]: "Jinja",
  [CAMPUS.MBALE]: "Mbale",
};

/**
 * @param {unknown} value
 * @returns {string | null} Campus enum value or null if empty/invalid
 */
export function parseCampus(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const compact = raw.toUpperCase().replace(/[\s_-]+/g, "");
  /** @type {Record<string, string>} */
  const aliases = {
    MAIN: CAMPUS.MAIN,
    MAINCAMPUS: CAMPUS.MAIN,
    KAMPALA: CAMPUS.MAIN,
    NAKAW: CAMPUS.MAIN,
    NAKAWA: CAMPUS.MAIN,
    ARUA: CAMPUS.ARUA,
    MBARARA: CAMPUS.MBARARA,
    JINJA: CAMPUS.JINJA,
    MBALE: CAMPUS.MBALE,
  };
  return aliases[compact] || null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function campusLabel(value) {
  const c = parseCampus(value) || (CAMPUS_VALUES.includes(String(value || "").trim()) ? String(value).trim() : null);
  if (!c) return null;
  return CAMPUS_LABELS[c] || c;
}

/**
 * Options for selects (forms + filters). Filter UIs should prepend “All campuses”.
 * @returns {{ value: string; label: string }[]}
 */
export function campusSelectOptions() {
  return CAMPUS_VALUES.map((value) => ({ value, label: CAMPUS_LABELS[value] }));
}
