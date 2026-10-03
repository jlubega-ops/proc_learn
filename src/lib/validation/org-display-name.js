export const ORG_NAME_SUFFIX = "Organisation";
export const ORG_NAME_BASE_MAX = 120;

/**
 * "Nakawa Cement Organisation" → "Nakawa Cement" (also accepts the US spelling).
 * @param {unknown} value
 */
export function stripOrgNameSuffix(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*organi[sz]ation$/i, "")
    .trim();
}

/**
 * @param {string} base
 */
export function buildOrgDisplayName(base) {
  return `${stripOrgNameSuffix(base)} ${ORG_NAME_SUFFIX}`.slice(0, 255);
}

/**
 * Validates the editable part of an organisation name (before the fixed "Organisation").
 * @param {unknown} value
 * @returns {{ ok: true; value: string } | { ok: false; error: string }}
 */
export function validateOrgNameBase(value) {
  const base = stripOrgNameSuffix(value);
  if (!base) return { ok: false, error: "Enter a name." };
  if (base.length < 2) return { ok: false, error: "Use at least 2 characters." };
  if (base.length > ORG_NAME_BASE_MAX) {
    return { ok: false, error: `Use ${ORG_NAME_BASE_MAX} characters or fewer.` };
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N} &'().,-]*$/u.test(base)) {
    return { ok: false, error: "Use letters, numbers, spaces and & ' ( ) . , - only." };
  }
  return { ok: true, value: base };
}
