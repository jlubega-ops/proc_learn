import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { validateProjectOrgRolePatch } from "@/lib/validation/project-org-role";
import {
  isProjectOrgAdminRole,
  isWorkflowOnlyOrgRole,
  projectOrgAdminRoleGuardError,
  workflowOnlyOrgRoleGuardError,
} from "@/lib/project-org-role";
import {
  IN_USE_MESSAGE,
  isForeignKeyViolation,
  orgRoleDeleteBlocker,
} from "@/lib/projects/delete-guards";

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

  if (body?.name !== undefined && String(body.name ?? "").trim() !== existing.name) {
    return NextResponse.json(
      {
        error: "Role names cannot be changed. Workflows identify roles by name.",
        fieldErrors: { name: "Role names are fixed." },
      },
      { status: 400 },
    );
  }

  if (isProjectOrgAdminRole(existing.name)) {
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

  if (isWorkflowOnlyOrgRole(existing.name)) {
    const blocked = workflowOnlyOrgRoleGuardError({
      name: existing.name,
      isActive: body?.isActive,
    });
    return NextResponse.json(
      { error: blocked.error, fieldErrors: blocked.fieldErrors },
      { status: 400 },
    );
  }

  const validated = validateProjectOrgRolePatch(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validated.errors },
      { status: 400 },
    );
  }

  const data = { ...validated.data };
  delete data.name;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes were provided." }, { status: 400 });
  }

  const row = await prisma.projectOrgRole.update({
    where: { id },
    data,
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

  if (isWorkflowOnlyOrgRole(existing.name)) {
    const blocked = workflowOnlyOrgRoleGuardError({ name: existing.name });
    return NextResponse.json({ error: blocked.error }, { status: 400 });
  }

  const blocker = await orgRoleDeleteBlocker(prisma, id);
  if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });

  try {
    await prisma.projectOrgRole.delete({ where: { id } });
  } catch (e) {
    if (isForeignKeyViolation(e)) return NextResponse.json({ error: IN_USE_MESSAGE }, { status: 409 });
    throw e;
  }

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_ROLE_DELETED,
    actorUserId: user.id,
    meta: { projectOrgRoleId: id, name: existing.name },
  });

  return NextResponse.json({ ok: true });
}
