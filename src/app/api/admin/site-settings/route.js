import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";
import {
  MAINTENANCE_BYPASS_COOKIE,
  MAINTENANCE_BYPASS_MAX_AGE_SECONDS,
  ensureSiteSettings,
  serializeSiteSettings,
  updateSiteSettings,
} from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireSystemAdmin() {
  const user = await getSessionUser();
  if (!user || sessionActiveRole(user) !== Role.SYSTEM_ADMIN) return null;
  return user;
}

export async function GET() {
  const user = await requireSystemAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const row = await ensureSiteSettings(user.id);
  return NextResponse.json(
    { settings: serializeSiteSettings(row) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request) {
  const user = await requireSystemAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const hasToggle = Object.prototype.hasOwnProperty.call(body ?? {}, "maintenanceEnabled");
  if (hasToggle && typeof body.maintenanceEnabled !== "boolean") {
    return NextResponse.json({ error: "maintenanceEnabled must be true or false." }, { status: 400 });
  }
  const regenerate = body?.regenerateBypassToken === true;
  if (!hasToggle && !regenerate) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const row = await updateSiteSettings({
    maintenanceEnabled: hasToggle ? body.maintenanceEnabled : undefined,
    regenerateBypassToken: regenerate,
    actorUserId: user.id,
  });

  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request);
  if (hasToggle) {
    await writeAuditLog({
      eventType: body.maintenanceEnabled
        ? AuditEvent.SITE_MAINTENANCE_ENABLED
        : AuditEvent.SITE_MAINTENANCE_DISABLED,
      actorUserId: user.id,
      ip,
      userAgent,
      meta: {
        description: body.maintenanceEnabled
          ? "System admin put the site under maintenance."
          : "System admin took the site out of maintenance.",
      },
    });
  }
  if (regenerate) {
    await writeAuditLog({
      eventType: AuditEvent.SITE_MAINTENANCE_LINK_REGENERATED,
      actorUserId: user.id,
      ip,
      userAgent,
      meta: { description: "System admin generated a new maintenance sign-in link." },
    });
  }

  const res = NextResponse.json({ ok: true, settings: serializeSiteSettings(row) });
  // Lets this browser reach /login again after signing out while maintenance is on.
  if (row.maintenanceEnabled && row.maintenanceBypassToken) {
    res.cookies.set(MAINTENANCE_BYPASS_COOKIE, row.maintenanceBypassToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAINTENANCE_BYPASS_MAX_AGE_SECONDS,
    });
  }
  return res;
}
