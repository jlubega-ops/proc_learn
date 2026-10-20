import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionOrgUser } from "@/lib/api/get-session-org-user";

export const runtime = "nodejs";

export async function GET(request) {
  const orgUser = await getSessionOrgUser();
  if (!orgUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const summary = searchParams.get("summary") === "1";

  if (summary) {
    const unreadWhere = {
      recipientOrgUserId: orgUser.id,
      readAt: null,
    };
    const [unreadCount, preview] = await Promise.all([
      prisma.projectOrgNotification.count({ where: unreadWhere }),
      prisma.projectOrgNotification.findMany({
        where: unreadWhere,
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);
    return NextResponse.json({ unreadCount, preview });
  }

  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSizeRaw = Number.parseInt(searchParams.get("pageSize") || "20", 10) || 20;
  const pageSize = Math.min(50, Math.max(5, pageSizeRaw));
  const where = { recipientOrgUserId: orgUser.id };

  const [total, items] = await Promise.all([
    prisma.projectOrgNotification.count({ where }),
    prisma.projectOrgNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    notifications: items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });
}

export async function PATCH(request) {
  const orgUser = await getSessionOrgUser();
  if (!orgUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const now = new Date();

  if (body?.markAllRead === true) {
    await prisma.projectOrgNotification.updateMany({
      where: { recipientOrgUserId: orgUser.id, readAt: null },
      data: { readAt: now },
    });
    return NextResponse.json({ ok: true });
  }

  if (body?.markRead === true && typeof body?.id === "string" && body.id.trim()) {
    const res = await prisma.projectOrgNotification.updateMany({
      where: {
        id: body.id.trim(),
        recipientOrgUserId: orgUser.id,
        readAt: null,
      },
      data: { readAt: now },
    });
    if (res.count === 0) {
      return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported operation." }, { status: 400 });
}
