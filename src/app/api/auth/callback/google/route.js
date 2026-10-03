import { cookies } from "next/headers";
import { UserAccountStatus } from "@prisma/client";
import { getAppSession, initSessionActivity } from "@/lib/auth/session";
import { buildIronSessionOptions } from "@/lib/auth/session-options";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { DEFAULT_POST_AUTH_PATH } from "@/lib/appConfig";
import { redirectToAppPath } from "@/lib/auth/app-redirect";
import { getGoogleOAuthRedirectUri } from "@/lib/oauth/google-config";
import {
  fetchGoogleProfileFromTokens,
  safeHttpsProfileImageUrl,
} from "@/lib/oauth/google-user-profile";
import { splitGoogleDisplayName } from "@/lib/user-display";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";
import { prisma } from "@/lib/prisma";
import { ROLE, grantedRoles, pickHighestGrantedRole } from "@/lib/roles";
import { isMaintenanceEnabled } from "@/lib/site-settings";
import { isMubsSchoolEmail } from "@/lib/mubs-email";
import { normalizeEmail } from "@/lib/validation/email";

export const runtime = "nodejs";

function redirectToLogin(query) {
  const q = query ? `?${query.replace(/^\?/, "")}` : "";
  return redirectToAppPath(`/login${q}`);
}

export async function GET(request) {
  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request);

  if (!buildIronSessionOptions()) {
    return redirectToLogin("error=auth_config");
  }

  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const storedState = cookieStore.get("pl_google_oauth_state")?.value;
  const nextRaw = cookieStore.get("pl_google_oauth_next")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return redirectToLogin("error=oauth_state");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return redirectToLogin("error=oauth_config");
  }

  const redirectUri = getGoogleOAuthRedirectUri();
  if (!redirectUri) {
    return redirectToLogin("error=oauth_config");
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return redirectToLogin("error=oauth_token");
  }

  const tokens = await tokenRes.json();
  const idToken = typeof tokens.id_token === "string" ? tokens.id_token : "";
  if (!idToken) {
    return redirectToLogin("error=oauth_token");
  }

  const infoRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  );
  const info = await infoRes.json().catch(() => ({}));
  if (!infoRes.ok || info.aud !== clientId) {
    return redirectToLogin("error=oauth_userinfo");
  }

  const email = normalizeEmail(info.email);
  if (!email) {
    return redirectToLogin("error=oauth_email");
  }
  if (!isMubsSchoolEmail(email)) {
    return redirectToLogin("error=oauth_mubs_email");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { userRoles: true, settings: true },
  });

  if (!user) {
    return redirectToLogin("error=google_not_registered");
  }

  if (user.accountStatus === UserAccountStatus.SUSPENDED) {
    return redirectToLogin("error=account_suspended");
  }

  if (
    (await isMaintenanceEnabled()) &&
    !grantedRoles(user.userRoles).includes(ROLE.SYSTEM_ADMIN)
  ) {
    await writeAuditLog({
      eventType: AuditEvent.LOGIN_BLOCKED_MAINTENANCE,
      actorUserId: user.id,
      targetUserId: user.id,
      ip,
      userAgent,
      meta: { email, method: "google_oauth" },
    });
    return redirectToAppPath("/maintenance");
  }

  const accessToken =
    typeof tokens.access_token === "string" ? tokens.access_token : "";
  const { name: googleName, picture: googlePicture } =
    await fetchGoogleProfileFromTokens({ idToken, accessToken });
  const parts = splitGoogleDisplayName(googleName);
  const nextImage = safeHttpsProfileImageUrl(googlePicture);

  const firstTrim = String(user.firstName || "").trim();
  const lastTrim = String(user.lastName || "").trim();
  const looksUnsetFirst =
    !firstTrim || firstTrim.toLowerCase() === "user";
  const looksUnsetLast =
    !lastTrim || lastTrim.toLowerCase() === "member";

  const fillFirst = Boolean(parts.firstName) && looksUnsetFirst;
  const fillLast = Boolean(parts.lastName) && looksUnsetLast;
  const fillMiddle =
    !String(user.middleName || "").trim() && Boolean(parts.middleName);
  const fillPhoto =
    Boolean(nextImage) &&
    (!user.profilePhotoUrl || !String(user.profilePhotoUrl).trim());

  const now = new Date();
  const data = {
    lastLoginAt: now,
    accountStatus: UserAccountStatus.ACTIVE,
    ...(user.activatedAt ? {} : { activatedAt: now }),
    ...(fillFirst ? { firstName: parts.firstName } : {}),
    ...(fillLast ? { lastName: parts.lastName } : {}),
    ...(fillMiddle ? { middleName: parts.middleName } : {}),
    ...(fillPhoto ? { profilePhotoUrl: nextImage } : {}),
  };

  await prisma.user.update({
    where: { id: user.id },
    data,
  });

  await writeAuditLog({
    eventType: AuditEvent.LOGIN_SUCCESS,
    actorUserId: user.id,
    targetUserId: user.id,
    ip,
    userAgent,
    meta: { email, method: "google_oauth" },
  });

  const session = await getAppSession();
  if (!session) {
    return redirectToLogin("error=auth_config");
  }

  session.userId = user.id;
  initSessionActivity(session);
  await session.save();

  const roleRows = await prisma.userRole.findMany({
    where: { userId: user.id },
    select: { role: true },
  });
  const granted = grantedRoles(roleRows);
  const loginActiveRole = pickHighestGrantedRole(granted);
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      theme: "light",
      activeRole: loginActiveRole,
    },
    update: { activeRole: loginActiveRole },
  });

  const mustChangePassword = Boolean(user.mustChangePassword);
  let dest = mustChangePassword ? "/setup-password" : safeNextPath(nextRaw);
  if (!mustChangePassword) {
    const { buildSessionPayloadForUserId } = await import("@/lib/auth/session-payload");
    const payload = await buildSessionPayloadForUserId(user.id);
    if (
      typeof payload.defaultPath === "string" &&
      payload.defaultPath.startsWith("/") &&
      (!nextRaw || safeNextPath(nextRaw) === "/" || safeNextPath(nextRaw) === DEFAULT_POST_AUTH_PATH)
    ) {
      dest = payload.defaultPath;
    }
  }
  const res = redirectToAppPath(dest);
  res.cookies.delete("pl_google_oauth_state");
  res.cookies.delete("pl_google_oauth_next");
  return res;
}
