import { isAuthLightRoutePath } from "@/lib/auth-light-routes";
import { readThemeFromCookieStore } from "@/lib/theme-storage";

/**
 * Server-side `html` dark class for first paint (no blocking script).
 * Auth routes are always light; otherwise use the theme preference cookie.
 *
 * @param {string | null | undefined} pathname
 * @param {{ get: (name: string) => { value: string } | undefined }} cookieStore
 */
export function resolveHtmlThemeClass(pathname, cookieStore) {
  if (isAuthLightRoutePath(pathname)) return "";
  const theme = readThemeFromCookieStore(cookieStore);
  return theme === "dark" ? "dark" : "";
}
