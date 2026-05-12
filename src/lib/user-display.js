/**
 * @param {{ firstName?: string | null; middleName?: string | null; lastName?: string | null }} u
 */
export function formatUserDisplayName(u) {
  const parts = [u.firstName, u.middleName, u.lastName]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  return parts.join(" ").trim();
}

/**
 * Map Google `name` into first / middle / last for DB fields (last is always non-empty when name is non-empty).
 * @param {string} full
 * @returns {{ firstName: string; middleName: string; lastName: string }}
 */
export function splitGoogleDisplayName(full) {
  const t = typeof full === "string" ? full.trim() : "";
  if (!t) {
    return { firstName: "", middleName: "", lastName: "" };
  }
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], middleName: "", lastName: parts[0] };
  }
  if (parts.length === 2) {
    return { firstName: parts[0], middleName: "", lastName: parts[1] };
  }
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}
