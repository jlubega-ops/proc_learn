import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { validateProjectOrgRolePatch } from "@/lib/validation/project-org-role";
import {
  isProjectOrgAdminRole,
  projectOrgAdminRoleGuardError,
} from "@/lib/project-org-role";

export const runtime = "nodejs";

export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user || sessionActiveRole(user) !== Role.SYSTEM_ADMIN) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid role id." }, { status: 400 });

  const existing = await prisma.projectOrgRole.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (isProjectOrgAdminRole(existing.name)) {
    if (body?.name !== undefined && !isProjectOrgAdminRole(body.name)) {
      const blocked = projectOrgAdminRoleGuardError({ name: existing.name });
      return NextResponse.json(
        { error: blocked.error, fieldErrors: { name: "Admin cannot be renamed." } },
        { status: 400 },
      );
    }
    if (body?.isActive === false) {
      const blocked = projectOrgAdminRoleGuardError({
        name: existing.name,
        isActive: false,
      });
      return NextResponse.json(
        { error: blocked.error, fieldErrors: blocked.fieldErrors },
        { status: 400 },
      );
    }
  }

  const validated = validateProjectOrgRolePatch(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validated.errors },
      { status: 400 },
    );
  }

  if (validated.data.name && validated.data.name !== existing.name) {
    if (isProjectOrgAdminRole(String(validated.data.name))) {
      return NextResponse.json(
        {
          error: "The Admin role already exists and is managed by the system.",
          fieldErrors: { name: "Admin is a required role name." },
        },
        { status: 409 },
      );
    }
    const clash = await prisma.projectOrgRole.findUnique({
      where: { name: String(validated.data.name) },
    });
    if (clash) {
      return NextResponse.json(
        { error: "A project role with this name already exists.", fieldErrors: { name: "Name is already in use." } },
        { status: 409 },
      );
    }
  }

  const row = await prisma.projectOrgRole.update({
    where: { id },
    data: validated.data,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_ROLE_UPDATED,
    actorUserId: user.id,
    meta: { projectOrgRoleId: row.id, name: row.name },
  });

  return NextResponse.json({ role: row });
}

export async function DELETE(_request, context) {
  const user = await getSessionUser();
  if (!user || sessionActiveRole(user) !== Role.SYSTEM_ADMIN) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid role id." }, { status: 400 });

  const existing = await prisma.projectOrgRole.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (isProjectOrgAdminRole(existing.name)) {
    const blocked = projectOrgAdminRoleGuardError({ name: existing.name });
    return NextResponse.json({ error: blocked.error }, { status: 400 });
  }

  await prisma.projectOrgRole.delete({ where: { id } });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_ROLE_DELETED,
    actorUserId: user.id,
    meta: { projectOrgRoleId: id, name: existing.name },
  });

  return NextResponse.json({ ok: true });
}
