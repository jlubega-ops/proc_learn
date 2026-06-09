/**
 * Pre-auth pages that always use light UI (`html` without `.dark`).
 * Keep in sync with the inline script in `app/layout.js`.
 */
const PREFIXES = ["/login", "/forgot-password", "/reset-password", "/activate", "/setup-password"];

/** @param {string | null | undefined} pathname */
export function isAuthLightRoutePath(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return false;
  for (const prefix of PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  return false;
}
