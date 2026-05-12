import { APP_BASE_URL } from "@/lib/appConfig";

/**
 * OAuth redirect URI sent to Google on `/start` and on the token exchange.
 * Must match **exactly** (scheme, host, port, path, no trailing slash) one row in
 * Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs →
 * **Authorized redirect URIs** (Error 400 `redirect_uri_mismatch` if it does not).
 */
export function getGoogleOAuthRedirectUri() {
  const explicit = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const base = APP_BASE_URL.replace(/\/$/, "");
  /** Matches common NextAuth-style path registered in Google Cloud Console. */
  return `${base}/api/auth/callback/google`;
}

export function getGoogleOAuthScopes() {
  return ["openid", "email", "profile"].join(" ");
}
