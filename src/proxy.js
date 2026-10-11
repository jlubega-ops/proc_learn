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
    return null;
  }
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

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|ico|png|jpg|jpeg|gif|webp|txt)).*)",
  ],
};
