import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { formatUserDisplayName } from "@/lib/user-display";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * @param {import("next/server").NextRequest} request
 */
export async function GET(request) {
  const user = await getSessionUser();
  if (!user || sessionActiveRole(user) !== Role.SYSTEM_ADMIN) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = String(searchParams.get("q") ?? "").trim();
  const eventType = String(searchParams.get("eventType") ?? "").trim();
  const from = String(searchParams.get("from") ?? "").trim();
  const to = String(searchParams.get("to") ?? "").trim();
  const page = Math.max(1, Number.parseInt(String(searchParams.get("page") ?? "1"), 10) || 1);
  const pageSizeRaw = Number.parseInt(String(searchParams.get("pageSize") ?? ""), 10);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : DEFAULT_PAGE_SIZE),
  );

  /** @type {import("@prisma/client").Prisma.AuditLogWhereInput[]} */
  const parts = [];

  if (eventType) {
    parts.push({ eventType });
  }

  if (from) {
    const d = new Date(`${from}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) parts.push({ createdAt: { gte: d } });
  }
  if (to) {
    const d = new Date(`${to}T23:59:59.999Z`);
    if (!Number.isNaN(d.getTime())) parts.push({ createdAt: { lte: d } });
  }

  if (q) {
    const tokens = q.split(/\s+/).filter(Boolean);
    /** @type {import("@prisma/client").Prisma.UserWhereInput[]} */
    const orName = [
      { email: { contains: q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } },
    ];
    if (tokens.length >= 2) {
      orName.push({
        AND: [
          { firstName: { contains: tokens[0] } },
          { lastName: { contains: tokens[tokens.length - 1] } },
        ],
      });
    }
    const matched = await prisma.user.findMany({
      where: { OR: orName },
      select: { id: true },
      take: 400,
    });
    const ids = matched.map((u) => u.id);
    if (ids.length === 0) {
      return NextResponse.json({
        items: [],
        total: 0,
        page,
        pageSize,
      });
    }
    parts.push({
      OR: [{ actorUserId: { in: ids } }, { targetUserId: { in: ids } }],
    });
  }

  const where =
    parts.length === 0 ? {} : parts.length === 1 ? parts[0] : { AND: parts };

  const skip = (page - 1) * pageSize;

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  const idSet = new Set();
  for (const r of rows) {
    if (r.actorUserId) idSet.add(r.actorUserId);
    if (r.targetUserId) idSet.add(r.targetUserId);
  }
  const users =
    idSet.size === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: [...idSet] } },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            middleName: true,
          },
        });
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));

  const items = rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    createdAt: r.createdAt.toISOString(),
    ip: r.ip,
    userAgent: r.userAgent,
    meta: r.meta,
    actorUserId: r.actorUserId,
    targetUserId: r.targetUserId,
    actorLabel: r.actorUserId
      ? (() => {
          const u = byId[r.actorUserId];
          if (!u) return r.actorUserId;
          return formatUserDisplayName(u) || u.email || r.actorUserId;
        })()
      : null,
    actorEmail: r.actorUserId ? byId[r.actorUserId]?.email ?? null : null,
    targetLabel: r.targetUserId
      ? (() => {
          const u = byId[r.targetUserId];
          if (!u) return r.targetUserId;
          return formatUserDisplayName(u) || u.email || r.targetUserId;
        })()
      : null,
    targetEmail: r.targetUserId ? byId[r.targetUserId]?.email ?? null : null,
  }));

  return NextResponse.json({ items, total, page, pageSize });
}
