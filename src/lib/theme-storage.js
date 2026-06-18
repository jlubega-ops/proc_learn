export const THEME_STORAGE_KEY = "proc-learn-theme";

/** One year — mirrors localStorage persistence for SSR theme class. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** @typedef {'light' | 'dark'} ThemeMode */

/** @returns {'light' | 'dark' | null} */
export function readStoredTheme() {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return null;
}

/** @param {ThemeMode} mode */
export function writeThemeCookieClient(mode) {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${THEME_STORAGE_KEY}=${mode};path=/;max-age=${THEME_COOKIE_MAX_AGE};samesite=lax`;
  } catch {
    /* ignore */
  }
}

/** @param {ThemeMode} mode */
export function writeStoredTheme(mode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    writeThemeCookieClient(mode);
  } catch {
    /* ignore */
  }
}

/** @param {ThemeMode} mode */
export function applyThemeClassToDocument(mode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", mode === "dark");
}

/** @param {{ get: (name: string) => { value: string } | undefined }} cookieStore */
export function readThemeFromCookieStore(cookieStore) {
  const v = cookieStore.get?.(THEME_STORAGE_KEY)?.value;
  if (v === "light" || v === "dark") return v;
  return null;
}
