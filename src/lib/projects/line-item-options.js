export const DEFAULT_UNIT_OF_MEASURE = "Lot";
export const DEFAULT_FUNDING_SOURCE = "Organisation Budget";

export const UNITS_OF_MEASURE = [
  "Lot",
  "Each",
  "Piece",
  "Set",
  "Pair",
  "Dozen",
  "Box",
  "Carton",
  "Pack",
  "Ream",
  "Roll",
  "Bag",
  "Kg",
  "Tonne",
  "Litre",
  "Metre",
  "Square metre",
  "Cubic metre",
  "Hour",
  "Day",
  "Week",
  "Month",
  "Year",
  "Trip",
  "Person",
  "Licence",
  "Service",
  "Lump sum",
];

export const FUNDING_SOURCES = [
  "Organisation Budget",
  "Government of Uganda",
  "Own source revenue",
  "Development partner",
  "Donor grant",
  "Loan",
];

export const LINE_TEXT_MAX = 120;
export const LINE_DESCRIPTION_MAX = 500;

/**
 * Required text field that must contain words, not only numbers or symbols.
 * @param {string | null | undefined} value
 * @param {string} label
 * @returns {string | null}
 */
export function validateLineText(value, label) {
  const v = String(value ?? "").trim();
  if (!v) return `Enter a ${label.toLowerCase()}.`;
  if (!/\p{L}/u.test(v)) return "Use words, not numbers.";
  if (v.length > LINE_TEXT_MAX) return `Max ${LINE_TEXT_MAX} characters.`;
  return null;
}

/**
 * Unit options including a legacy value that is not in the list.
 * @param {string | null | undefined} current
 */
export function unitOptionsFor(current) {
  const v = String(current || "").trim();
  return v && !UNITS_OF_MEASURE.includes(v) ? [v, ...UNITS_OF_MEASURE] : UNITS_OF_MEASURE;
}
