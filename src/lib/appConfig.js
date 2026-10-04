/** Public app strings (override via .env — see .env.example). */
export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Proc Learn";

export const ORG_SHORT =
  process.env.NEXT_PUBLIC_ORG_SHORT?.trim() || "MUBS";

export const ORG_NAME =
  process.env.NEXT_PUBLIC_ORG_NAME?.trim() ||
  "Makerere University Business School";

/** Product label used in printouts and generated copy, e.g. "MUBS Proc Learn". */
export const APP_BRAND_LABEL = `${ORG_SHORT} ${APP_NAME}`;

export const COPYRIGHT_YEAR =
  process.env.NEXT_PUBLIC_COPYRIGHT_YEAR?.trim() ||
  String(new Date().getFullYear());

/** After sign-in or role switch (client + server redirects). */
export const DEFAULT_POST_AUTH_PATH =
  process.env.NEXT_PUBLIC_DEFAULT_POST_AUTH_PATH?.trim() || "/";

/**
 * Normalize a configured origin (scheme + host + optional port). No default host.
 * @param {string} raw
 * @returns {string}
 */
function normalizePublicOrigin(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

/**
 * Public site origin from env only (`APP_URL`, then `NEXTAUTH_URL`).
 * Never falls back to a hardcoded host. Empty string if unset / invalid.
 */
export function getAppBaseUrl() {
  return (
    normalizePublicOrigin(process.env.APP_URL || "") ||
    normalizePublicOrigin(process.env.NEXTAUTH_URL || "")
  );
}

/**
 * Absolute URL on the public origin (emails, OAuth, post-auth redirects).
 * @param {string} pathAndSearch pathname starting with `/`, optionally with query
 * @returns {string}
 */
export function appAbsoluteUrl(pathAndSearch) {
  const base = getAppBaseUrl();
  const raw = String(pathAndSearch || "/");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  if (!base) {
    throw new Error(
      "APP_URL (or NEXTAUTH_URL) must be set to the public site origin, for example https://example.org",
    );
  }
  return `${base}${path}`;
}

/** Idle logout window in minutes (server-enforced when implemented). */
const idleRaw = process.env.SESSION_IDLE_MINUTES?.trim();
export const SESSION_IDLE_MINUTES =
  idleRaw && !Number.isNaN(Number(idleRaw)) ? Number(idleRaw) : 30;
