import { NextResponse } from "next/server";
import { appAbsoluteUrl, getAppBaseUrl } from "@/lib/appConfig";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";
import {
  MAINTENANCE_BYPASS_COOKIE,
  MAINTENANCE_BYPASS_MAX_AGE_SECONDS,
  bypassTokenMatches,
  readSiteSettings,
} from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** @param {Request} request @param {string} path */
function redirectTo(request, path) {
  return NextResponse.redirect(getAppBaseUrl() ? appAbsoluteUrl(path) : new URL(path, request.url));
}

export async function GET(request, { params }) {
  const { token } = await params;
  const settings = await readSiteSettings({ fresh: true });
  if (!bypassTokenMatches(settings, decodeURIComponent(String(token || "")))) {
    return redirectTo(request, settings.maintenanceEnabled ? "/maintenance" : "/login");
  }

  await writeAuditLog({
    eventType: AuditEvent.SITE_MAINTENANCE_BYPASS_USED,
    ip: getRequestIp(request),
    userAgent: getRequestUserAgent(request),
    meta: { description: "Admin sign-in link used during maintenance." },
  });

  const res = redirectTo(request, "/login?next=%2Fadmin%2Fsite-settings");
  res.cookies.set(MAINTENANCE_BYPASS_COOKIE, settings.maintenanceBypassToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAINTENANCE_BYPASS_MAX_AGE_SECONDS,
  });
  return res;
}
