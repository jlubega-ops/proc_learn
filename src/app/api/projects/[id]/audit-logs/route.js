import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { formatUserDisplayName } from "@/lib/user-display";

export const runtime = "nodejs";

const ORG_EVENT_PREFIX = "PROJECT_ORG_";

/**
 * Organisation Administrator audit trail for actions inside this organisation.
 */
export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    requireOrgAdmin: true,
  });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number.parseInt(String(searchParams.get("page") ?? "1"), 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(String(searchParams.get("pageSize") ?? "25"), 10) || 25),
  );
  const q = String(searchParams.get("q") ?? "").trim();
  const eventType = String(searchParams.get("eventType") ?? "").trim();

  const rows = await prisma.auditLog.findMany({
    where: {
      eventType: eventType ? eventType : { startsWith: ORG_EVENT_PREFIX },
    },
    orderBy: { createdAt: "desc" },
    take: 800,
  });

  const filtered = rows.filter((row) => {
    const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
    if (String(meta.projectId || "") !== projectId) return false;
    if (!q) return true;
    const hay = JSON.stringify({
      eventType: row.eventType,
      meta,
      actorUserId: row.actorUserId,
    }).toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  const platformUserIds = [
    ...new Set(pageRows.map((r) => r.actorUserId).filter(Boolean)),
  ];
  const orgUserIds = [
    ...new Set(
      pageRows
        .map((r) => {
          const meta = r.meta && typeof r.meta === "object" ? r.meta : {};
          return typeof meta.actorOrgUserId === "string" ? meta.actorOrgUserId : null;
        })
        .filter(Boolean),
    ),
  ];

  const [platformUsers, orgUsers] = await Promise.all([
    platformUserIds.length
      ? prisma.user.findMany({
          where: { id: { in: platformUserIds } },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            middleName: true,
          },
        })
      : Promise.resolve([]),
    orgUserIds.length
      ? prisma.projectOrgUser.findMany({
          where: { id: { in: orgUserIds }, projectId },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : Promise.resolve([]),
  ]);

  const platformById = Object.fromEntries(platformUsers.map((u) => [u.id, u]));
  const orgById = Object.fromEntries(orgUsers.map((u) => [u.id, u]));

  return NextResponse.json({
    items: pageRows.map((row) => {
      const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
      const actorOrgUserId =
        typeof meta.actorOrgUserId === "string" ? meta.actorOrgUserId : null;
      const actorRoleName =
        typeof meta.actorRoleName === "string" ? meta.actorRoleName : null;
      const platformActor = row.actorUserId ? platformById[row.actorUserId] : null;
      const orgActor = actorOrgUserId ? orgById[actorOrgUserId] : null;

      let actorDisplay = null;
      if (orgActor) {
        actorDisplay =
          `${orgActor.firstName || ""} ${orgActor.lastName || ""}`.trim() ||
          orgActor.email ||
          null;
      } else if (platformActor) {
        actorDisplay = formatUserDisplayName(platformActor) || platformActor.email || null;
      }

      return {
        id: row.id,
        eventType: row.eventType,
        createdAt: row.createdAt,
        ip: row.ip,
        meta,
        actorUserId: row.actorUserId,
        actorOrgUserId,
        actorRoleName,
        actor: actorDisplay
          ? {
              id: orgActor?.id || platformActor?.id || null,
              displayName: actorDisplay,
              email: orgActor?.email || platformActor?.email || null,
            }
          : null,
      };
    }),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });
}
