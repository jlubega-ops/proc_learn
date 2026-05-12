/**
 * Accepts https URLs or same-origin API media paths.
 * @param {unknown} raw
 * @returns {string | null} normalized or null if invalid
 */
export function normalizeProfilePhotoInput(raw) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (s.startsWith("https://")) {
    try {
      const u = new URL(s);
      if (u.protocol !== "https:") return null;
      return s.slice(0, 2048);
    } catch {
      return null;
    }
  }
  if (s.startsWith("/api/media/")) {
    return s.slice(0, 2048);
  }
  return null;
}
