const MIN = 8;

/**
 * @param {unknown} password
 * @returns {{ ok: true } | { ok: false; error: string }}
 */
export function validateNewPassword(password) {
  const p = typeof password === "string" ? password : "";
  if (p.length < MIN) {
    return { ok: false, error: `Password must be at least ${MIN} characters.` };
  }
  return { ok: true };
}
