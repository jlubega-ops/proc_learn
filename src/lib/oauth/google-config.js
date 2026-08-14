import { getAppBaseUrl } from "@/lib/appConfig";

/**
 * OAuth redirect URI sent to Google on `/start` and on the token exchange.
 * Built from `GOOGLE_REDIRECT_URI` or `APP_URL` / `NEXTAUTH_URL` + callback path.
 * Must match **exactly** (scheme, host, port, path, no trailing slash) one row in
 * Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs →
 * **Authorized redirect URIs** (Error 400 `redirect_uri_mismatch` if it does not).
 */
export function getGoogleOAuthRedirectUri() {
  const explicit = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const base = getAppBaseUrl();
  if (!base) return "";
  return `${base}/api/auth/callback/google`;
}

export function getGoogleOAuthScopes() {
  return ["openid", "email", "profile"].join(" ");
}
