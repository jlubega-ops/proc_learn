/** Single canonical email shape for lookups (trim + lower case). */
export function normalizeEmail(email) {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}
