export const THEME_STORAGE_KEY = "proc-learn-theme";

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

/** @param {'light' | 'dark'} mode */
export function writeStoredTheme(mode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** @param {'light' | 'dark'} mode */
export function applyThemeClassToDocument(mode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", mode === "dark");
}
