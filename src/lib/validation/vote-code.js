/** Ugandan government votes are 3-digit codes (e.g. 120 central, 5xx–8xx local governments). */
export const VOTE_CODE_PATTERN = /^\d{3}$/;

/**
 * Empty is allowed (not yet configured).
 * @param {unknown} value
 * @returns {{ ok: true; value: string | null } | { ok: false; error: string }}
 */
export function validateVoteCode(value) {
  const v = String(value ?? "").replace(/\s+/g, "");
  if (!v) return { ok: true, value: null };
  if (!VOTE_CODE_PATTERN.test(v)) return { ok: false, error: "Use the 3-digit vote number." };
  return { ok: true, value: v };
}
