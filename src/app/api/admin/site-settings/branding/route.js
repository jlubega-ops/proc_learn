import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";
import { RATE_LIMIT_MESSAGE, hitRateLimit } from "@/lib/rate-limit";
import {
  BRANDING_KINDS,
  getSiteBranding,
  isBrandingKind,
  resetBrandingImage,
  saveBrandingImage,
} from "@/lib/site-branding";

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
  return NextResponse.json({ branding: await getSiteBranding() }, { headers: { "Cache-Control": "no-store" } });
}

/** Multipart: `kind` = logo | background, `file` = PNG / JPG / WebP. */
export async function POST(request) {
  const user = await requireSystemAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const limited = hitRateLimit(`site-branding:${user.id}`, { limit: 20, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  const kind = form.get("kind");
  const file = form.get("file");
  if (!isBrandingKind(kind)) return NextResponse.json({ error: "Unknown image type." }, { status: 400 });
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an image.", fieldErrors: { [kind]: "Choose an image." } }, { status: 400 });
  }
  if (file.size > BRANDING_KINDS[kind].maxBytes) {
    const error = `${BRANDING_KINDS[kind].label} must be ${Math.round(BRANDING_KINDS[kind].maxBytes / 1024 / 1024)}MB or smaller.`;
    return NextResponse.json({ error, fieldErrors: { [kind]: error } }, { status: 400 });
  }

  const result = await saveBrandingImage(kind, Buffer.from(await file.arrayBuffer()), user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, fieldErrors: { [kind]: result.error } }, { status: 400 });
  }

  await writeAuditLog({
    eventType: AuditEvent.SITE_BRANDING_UPDATED,
    actorUserId: user.id,
    ip: getRequestIp(request),
    userAgent: getRequestUserAgent(request),
    meta: { kind, description: `System admin uploaded a new site ${BRANDING_KINDS[kind].label.toLowerCase()}.` },
  });

  return NextResponse.json({ ok: true, branding: await getSiteBranding() });
}

/** `?kind=logo|background` — back to the bundled default. */
export async function DELETE(request) {
  const user = await requireSystemAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const kind = new URL(request.url).searchParams.get("kind");
  if (!isBrandingKind(kind)) return NextResponse.json({ error: "Unknown image type." }, { status: 400 });

  await resetBrandingImage(kind, user.id);
  await writeAuditLog({
    eventType: AuditEvent.SITE_BRANDING_RESET,
    actorUserId: user.id,
    ip: getRequestIp(request),
    userAgent: getRequestUserAgent(request),
    meta: { kind, description: `System admin restored the default site ${BRANDING_KINDS[kind].label.toLowerCase()}.` },
  });

  return NextResponse.json({ ok: true, branding: await getSiteBranding() });
}
