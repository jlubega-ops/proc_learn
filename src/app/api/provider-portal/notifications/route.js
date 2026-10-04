import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePortalPaging, requireProviderPortalSession } from "@/lib/projects/provider-portal";
import {
  listProviderNotifications,
  markProviderNotificationsRead,
} from "@/lib/projects/provider-notifications";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireProviderPortalSession(prisma);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const sp = new URL(request.url).searchParams;
  const filter = sp.get("filter");
  const data = await listProviderNotifications(prisma, {
    providerId: auth.provider.id,
    ...parsePortalPaging(sp),
    filter: filter === "unread" || filter === "read" ? filter : null,
  });
  return NextResponse.json(data);
}

export async function PATCH(request) {
  const auth = await requireProviderPortalSession(prisma);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const count = await markProviderNotificationsRead(prisma, {
    providerId: auth.provider.id,
    ids: Array.isArray(body?.ids) ? body.ids : null,
    all: body?.all === true,
  });
  return NextResponse.json({ ok: true, count });
}
