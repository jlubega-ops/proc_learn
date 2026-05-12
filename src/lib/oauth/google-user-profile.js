/**
 * Read display name and avatar URL from Google after an authorization-code exchange.
 * Prefer the userinfo endpoint when an access token is present; otherwise decode the ID token payload.
 * @param {{ idToken: string; accessToken?: string }} tokens
 * @returns {Promise<{ name: string; picture: string }>}
 */
export async function fetchGoogleProfileFromTokens({ idToken, accessToken }) {
  let name = "";
  let picture = "";

  const at = typeof accessToken === "string" ? accessToken.trim() : "";
  if (at) {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${at}` },
    });
    if (res.ok) {
      const p = await res.json().catch(() => ({}));
      if (typeof p.name === "string") name = p.name.trim();
      if (typeof p.picture === "string") picture = p.picture.trim();
    }
  }

  if (!name || !picture) {
    const parts = typeof idToken === "string" ? idToken.split(".") : [];
    if (parts.length === 3) {
      try {
        const json = Buffer.from(parts[1], "base64url").toString("utf8");
        const payload = JSON.parse(json);
        if (!name && typeof payload.name === "string") name = payload.name.trim();
        if (!picture && typeof payload.picture === "string") {
          picture = payload.picture.trim();
        }
      } catch {
        // ignore malformed JWT payload
      }
    }
  }

  return { name, picture };
}

/**
 * @param {string} url
 * @returns {string} empty if not a safe https URL
 */
export function safeHttpsProfileImageUrl(url) {
  if (typeof url !== "string") return "";
  const u = url.trim();
  if (!u.startsWith("https://")) return "";
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:") return "";
    return u.slice(0, 2048);
  } catch {
    return "";
  }
}

const DISPLAY_NAME_MAX = 191;

/**
 * @param {string} raw
 * @returns {string}
 */
export function clampDisplayName(raw) {
  if (typeof raw !== "string") return "";
  const t = raw.trim();
  if (!t) return "";
  return t.length > DISPLAY_NAME_MAX ? t.slice(0, DISPLAY_NAME_MAX) : t;
}
