import { NextResponse } from "next/server";
import { unsealData } from "iron-session";
import {
  SESSION_COOKIE_NAME,
  getSessionEncryptionSecret,
} from "@/lib/auth/session-options";
import {
  MAINTENANCE_API_MESSAGE,
  MAINTENANCE_BYPASS_COOKIE,
  bypassTokenMatches,
  readSiteSettings,
  sessionHasMaintenanceAccess,
} from "@/lib/site-settings";
import { prisma } from "@/lib/prisma";
import {
  attemptLockedMessage,
  loadAttemptWorkspaceState,
} from "@/lib/academic/attempt-workspace";
import {
  apiPrefixAllowed,
  orgUserPageAllowed,
  platformPageAccess,
  providerPageAllowed,
} from "@/lib/auth/route-policy";
import { UserAccountStatus } from "@prisma/client";
import { isSessionVersionCurrent } from "@/lib/auth/session-version";
import { sanitizeActiveRole } from "@/lib/roles";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PROJECT_API_RE = /^\/api\/projects\/([0-9a-f-]{36})(?:\/(.*))?$/i;
/** Writes still allowed in a locked attempt organisation (local drafts only). */
const LOCKED_WRITE_ALLOWLIST = new Set(["form-drafts"]);

/**
 * @param {string} pathname
 * @param {string} base
 */
function matchesPath(pathname, base) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** @param {string} pathname */
function isPublicPath(pathname) {
  return ["/login", "/forgot-password", "/reset-password", "/activate", "/maintenance"].some((p) =>
    matchesPath(pathname, p),
  );
}

/** Reachable by anyone while maintenance is on. */
function isMaintenanceOpenPath(pathname) {
  return (
    matchesPath(pathname, "/maintenance") ||
    pathname === "/api/site/status" ||
    pathname.startsWith("/api/site/branding/") ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/provider-portal/logout"
  );
}

/** Reachable during maintenance only with the admin bypass cookie (sign-in screens). */
function isBypassAuthPath(pathname) {
  return (
    ["/login", "/forgot-password", "/reset-password"].some((p) => matchesPath(pathname, p)) ||
    pathname.startsWith("/api/auth/")
  );
}

/** @param {import("next/server").NextRequest} request */
async function readSessionData(request) {
  const sealed = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const password = getSessionEncryptionSecret();
  if (!sealed || password.length < 32) return null;
  try {
    return await unsealData(sealed, { password });
  } catch {
    return null;
  }
}

/**
 * @param {import("next/server").NextRequest} request
 * @param {string} pathname
 * @param {Awaited<ReturnType<typeof readSiteSettings>>} settings
 */
async function maintenanceAllows(request, pathname, settings) {
  if (isMaintenanceOpenPath(pathname)) return true;
  if (await sessionHasMaintenanceAccess(await readSessionData(request))) return true;
  const bypass = request.cookies.get(MAINTENANCE_BYPASS_COOKIE)?.value;
  return isBypassAuthPath(pathname) && bypassTokenMatches(settings, bypass);
}

/**
 * @param {import("next/server").NextRequest} request
 * @param {boolean} isApi
 */
function blockForMaintenance(request, isApi) {
  if (isApi) {
    return NextResponse.json(
      { error: MAINTENANCE_API_MESSAGE, code: "maintenance" },
      { status: 503, headers: { "Retry-After": "300", "Cache-Control": "no-store" } },
    );
  }
  const url = request.nextUrl.clone();
  url.pathname = "/maintenance";
  url.search = "";
  return NextResponse.redirect(url);
}

/**
 * Workspace a write request targets, for the submitted-attempt lock.
 * @param {import("next/server").NextRequest} request
 * @param {string} pathname
 * @returns {Promise<string | null>}
 */
async function writeTargetWorkspaceId(request, pathname) {
  const m = PROJECT_API_RE.exec(pathname);
  if (m) {
    const firstSegment = String(m[2] || "").split("/")[0];
    if (LOCKED_WRITE_ALLOWLIST.has(firstSegment)) return null;
    return m[1];
  }
  if (pathname.startsWith("/api/provider-portal/") && pathname !== "/api/provider-portal/logout") {
    const session = await readSessionData(request);
    const providerId = session && typeof session === "object" ? session.providerId : null;
    if (!providerId) return null;
    const provider = await prisma.projectOrgProvider.findUnique({
      where: { id: String(providerId) },
      select: { projectId: true },
    });
    return provider?.projectId || null;
  }
  return null;
}

/**
 * Submitted (or timed-out) attempt organisations are read-only for everyone.
 * @param {import("next/server").NextRequest} request
 * @param {string} pathname
 */
async function blockLockedAttemptWrite(request, pathname) {
  if (READ_METHODS.has(request.method)) return null;
  try {
    const workspaceId = await writeTargetWorkspaceId(request, pathname);
    if (!workspaceId) return null;
    const state = await loadAttemptWorkspaceState(prisma, workspaceId);
    if (!state?.locked) return null;
    return NextResponse.json(
      { error: attemptLockedMessage(state.lockReason), code: "ATTEMPT_LOCKED" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not verify this workspace. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

/**
 * Who is calling: session kind plus ACTIVE role (platform) or project (org user).
 * `revoked` = platform session of a suspended / deleted user or one replaced by a newer sign-in.
 * @param {any} session unsealed session data
 * @returns {Promise<{ kind: 'user' | 'org' | 'provider' | 'revoked' | 'none'; activeRole?: string | null; projectId?: string | null }>}
 */
async function resolveCaller(session) {
  if (!session || typeof session !== "object") return { kind: "none" };
  if (session.orgUserId) {
    const orgUser = await prisma.projectOrgUser.findUnique({
      where: { id: String(session.orgUserId) },
      select: { projectId: true },
    });
    return { kind: "org", projectId: orgUser?.projectId || null };
  }
  if (session.userId) {
    const user = await prisma.user.findUnique({
      where: { id: String(session.userId) },
      select: {
        accountStatus: true,
        sessionVersion: true,
        settings: { select: { activeRole: true } },
        userRoles: { select: { role: true } },
      },
    });
    if (
      !user ||
      user.accountStatus === UserAccountStatus.SUSPENDED ||
      !isSessionVersionCurrent(session, user)
    ) {
      return { kind: "revoked" };
    }
    const granted = user.userRoles.map((r) => r.role);
    return {
      kind: "user",
      activeRole: sanitizeActiveRole(granted, String(user.settings?.activeRole || "")),
    };
  }
  if (session.providerId) return { kind: "provider" };
  return { kind: "none" };
}

/**
 * @param {import("next/server").NextRequest} request
 * @param {string} pathname
 */
function redirectTo(request, pathname) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

/** @param {NextResponse} response */
function clearSessionCookie(response) {
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.headers.set("Clear-Site-Data", '"cache"');
  return response;
}

/**
 * Page URL gate by session kind + ACTIVE role (see `src/lib/auth/route-policy.js`).
 * @param {import("next/server").NextRequest} request
 * @param {string} pathname
 */
async function blockDisallowedPage(request, pathname) {
  const caller = await resolveCaller(await readSessionData(request));
  if (caller.kind === "revoked") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("reason", "session_ended");
    return clearSessionCookie(NextResponse.redirect(url));
  }
  if (caller.kind === "provider") {
    return providerPageAllowed(pathname) ? null : redirectTo(request, "/provider-portal");
  }
  if (caller.kind === "org") {
    if (orgUserPageAllowed(pathname, caller.projectId)) return null;
    return caller.projectId ? redirectTo(request, `/projects/${caller.projectId}`) : null;
  }
  if (caller.kind === "user") {
    if (providerPageAllowed(pathname)) return redirectTo(request, "/");
    return platformPageAccess(pathname, caller.activeRole).allowed ? null : redirectTo(request, "/");
  }
  return null;
}

/**
 * API gate by session kind only — handlers still authorize roles / org permissions.
 * @param {import("next/server").NextRequest} request
 * @param {string} pathname
 */
async function blockDisallowedApi(request, pathname) {
  const caller = await resolveCaller(await readSessionData(request));
  if (caller.kind === "revoked") {
    if (pathname.startsWith("/api/auth/") || pathname === "/api/provider-portal/login") return null;
    return clearSessionCookie(
      NextResponse.json(
        { error: "Your session has ended. Sign in again.", code: "SESSION_ENDED" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      ),
    );
  }
  if (apiPrefixAllowed(pathname, caller)) return null;
  return NextResponse.json(
    { error: "Not found." },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

/** Next.js 16+ request interception (replaces deprecated `middleware`). */
export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  const settings = await readSiteSettings();
  if (settings.maintenanceEnabled && !(await maintenanceAllows(request, pathname, settings))) {
    return blockForMaintenance(request, isApi);
  }

  if (isApi) {
    const denied = await blockDisallowedApi(request, pathname);
    if (denied) return denied;
    const locked = await blockLockedAttemptWrite(request, pathname);
    return locked || NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pl-pathname", pathname);

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const next = pathname + (request.nextUrl.search || "");
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  const pageDenied = await blockDisallowedPage(request, pathname);
  if (pageDenied) return pageDenied;

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|ico|png|jpg|jpeg|gif|webp|txt)).*)",
  ],
};
