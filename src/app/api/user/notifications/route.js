import { NextResponse } from "next/server";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { notificationAudienceWhere } from "@/lib/notification-audience";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * @param {import("next/server").NextRequest} request
 */
export async function GET(request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const activeRole = sessionActiveRole(user);
  const audience = notificationAudienceWhere(activeRole);
  const { searchParams } = new URL(request.url);
  const summary = searchParams.get("summary") === "1";

  if (summary) {
    const unreadWhere = {
      userId: user.id,
      readAt: null,
      ...audience,
    };
    const [unreadCount, preview] = await Promise.all([
      prisma.notification.count({ where: unreadWhere }),
      prisma.notification.findMany({
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
  const where = { userId: user.id, ...audience };

  const [total, items] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
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
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const activeRole = sessionActiveRole(user);
  const audience = notificationAudienceWhere(activeRole);

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const now = new Date();

  if (body?.markAllRead === true) {
    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null, ...audience },
      data: { readAt: now },
    });
    return NextResponse.json({ ok: true });
  }

  if (body?.markRead === true && typeof body?.id === "string" && body.id.trim()) {
    const id = body.id.trim();
    const res = await prisma.notification.updateMany({
      where: { id, userId: user.id, readAt: null, ...audience },
      data: { readAt: now },
    });
    if (res.count === 0) {
      return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  const ids = Array.isArray(body?.ids)
    ? body.ids.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (body?.markRead === true && ids.length > 0) {
    await prisma.notification.updateMany({
      where: { userId: user.id, id: { in: ids }, readAt: null, ...audience },
      data: { readAt: now },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported operation." }, { status: 400 });
}
