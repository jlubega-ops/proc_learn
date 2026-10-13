import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { cachedRead } from "@/lib/server-cache";
import { cachedJson } from "@/lib/api/cached-json";
import { validateProjectOrgRoleInput } from "@/lib/validation/project-org-role";
import {
  ensureProjectOrgAdminRole,
  isProjectOrgAdminRole,
} from "@/lib/project-org-role";

export const runtime = "nodejs";

function canViewProjectSettings(activeRole) {
  return activeRole === Role.SYSTEM_ADMIN || activeRole === Role.EXAMINER;
}

export async function GET(request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (!canViewProjectSettings(activeRole) && activeRole !== Role.STUDENT) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (activeRole === Role.SYSTEM_ADMIN) {
    await ensureProjectOrgAdminRole(prisma);
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSizeRaw = Number(searchParams.get("pageSize") || 20);
  const pageSize = Math.min(50, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 20));
  const skip = (page - 1) * pageSize;
  const includeInactive = activeRole === Role.SYSTEM_ADMIN;

  const where = includeInactive ? {} : { isActive: true };

  const payload = await cachedRead(
    `project-org-roles:${includeInactive ? "all" : "active"}:${page}:${pageSize}`,
    ["ProjectOrgRole"],
    async () => {
      const [total, roles] = await Promise.all([
        prisma.projectOrgRole.count({ where }),
        prisma.projectOrgRole.findMany({
          where,
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          skip,
          take: pageSize,
        }),
      ]);
      return {
        roles: roles.map((row) => ({
          ...row,
          isRequired: isProjectOrgAdminRole(row.name),
        })),
        page,
        pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  );

  return cachedJson(request, { ...payload, canManage: activeRole === Role.SYSTEM_ADMIN }, { revalidate: true });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || sessionActiveRole(user) !== Role.SYSTEM_ADMIN) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validated = validateProjectOrgRoleInput(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validated.errors },
      { status: 400 },
    );
  }

  if (isProjectOrgAdminRole(validated.data.name)) {
    return NextResponse.json(
      {
        error: "The Admin role already exists and is managed by the system.",
        fieldErrors: { name: "Admin is a required role and cannot be created again." },
      },
      { status: 409 },
    );
  }

  const existing = await prisma.projectOrgRole.findUnique({
    where: { name: validated.data.name },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A project role with this name already exists.", fieldErrors: { name: "Name is already in use." } },
      { status: 409 },
    );
  }

  const last = await prisma.projectOrgRole.aggregate({ _max: { sortOrder: true } });
  const row = await prisma.projectOrgRole.create({
    data: { ...validated.data, sortOrder: (last._max.sortOrder ?? 0) + 1 },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_ROLE_CREATED,
    actorUserId: user.id,
    meta: { projectOrgRoleId: row.id, name: row.name },
  });

  return NextResponse.json({ role: row }, { status: 201 });
}
