const MALE_OR_FEMALE = new Set(["MALE", "FEMALE"]);

/**
 * Optional sex for API bodies: only male or female, or omitted / null.
 * @param {unknown} value
 * @returns {import("@prisma/client").Sex | null | undefined} `null` = clear; `undefined` = invalid when a value was sent
 */
export function parseOptionalMaleFemaleSex(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const u = value.trim().toUpperCase();
  if (!MALE_OR_FEMALE.has(u)) return undefined;
  return /** @type {import("@prisma/client").Sex} */ (u);
}
