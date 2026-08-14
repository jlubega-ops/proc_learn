import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { redirectToAppPath } from "@/lib/auth/app-redirect";
import {
  getGoogleOAuthRedirectUri,
  getGoogleOAuthScopes,
} from "@/lib/oauth/google-config";

export const runtime = "nodejs";

export function GET(request) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const nextDest = safeNextPath(request.nextUrl.searchParams.get("next"));

  const loginError = (code) => {
    const q = new URLSearchParams({ error: code, next: nextDest });
    return redirectToAppPath(`/login?${q.toString()}`);
  };

  if (!clientId) {
    return loginError("oauth_config");
  }

  const state = randomBytes(24).toString("hex");
  const redirectUri = getGoogleOAuthRedirectUri();
  if (!redirectUri) {
    return loginError("oauth_config");
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", getGoogleOAuthScopes());
  /** Prefer online login flow; avoid sticky refresh-token behaviour for account pickers. */
  url.searchParams.set("access_type", "online");
  /**
   * `select_account` shows Google’s account picker when multiple sessions exist.
   * `login` forces a fresh authentication step so Google does not silently reuse the last account.
   * (Space-delimited `prompt` values per OpenID / Google authorization parameters.)
   */
  url.searchParams.set("prompt", "select_account login");
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString());
  const cookieBase = {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  };
  res.cookies.set("pl_google_oauth_state", state, cookieBase);
  res.cookies.set("pl_google_oauth_next", nextDest, cookieBase);
  return res;
}
