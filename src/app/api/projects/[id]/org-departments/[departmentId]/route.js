import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import {
  deptSelect,
  serializeProjectOrgDepartment,
} from "@/lib/projects/org-departments";
import { validateProjectOrgDepartmentPatch } from "@/lib/validation/project-org-department";

export const runtime = "nodejs";

async function requireOrgAdmin(prisma, { projectId, userId, activeRole }) {
  const auth = await authorizeProjectOrgAdmin(prisma, { projectId, userId, activeRole });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }
  return null;
}

export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const departmentId = String(params?.departmentId || "").trim();
  if (!projectId || !departmentId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const denied = await requireOrgAdmin(prisma, {
    projectId,
    userId: user.id,
    activeRole,
  });
  if (denied) return denied;

  const existing = await prisma.projectOrgDepartment.findFirst({
    where: { id: departmentId, projectId },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validated = validateProjectOrgDepartmentPatch(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validated.errors },
      { status: 400 },
    );
  }

  const row = await prisma.projectOrgDepartment.update({
    where: { id: departmentId },
    data: validated.data,
    select: {
      ...deptSelect,
      subunits: { orderBy: [{ name: "asc" }], select: deptSelect },
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_DEPARTMENT_UPDATED,
    actorUserId: user.id,
    meta: { projectId, departmentId: row.id, name: row.name },
  });

  return NextResponse.json({ department: serializeProjectOrgDepartment(row) });
}

export async function DELETE(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const departmentId = String(params?.departmentId || "").trim();
  if (!projectId || !departmentId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const denied = await requireOrgAdmin(prisma, {
    projectId,
    userId: user.id,
    activeRole,
  });
  if (denied) return denied;

  const existing = await prisma.projectOrgDepartment.findFirst({
    where: { id: departmentId, projectId },
    include: { subunits: { select: { id: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const assignedCount = await prisma.projectOrgUser.count({
    where: {
      projectId,
      OR: [{ departmentId }, { subunitId: departmentId }],
    },
  });
  if (assignedCount > 0) {
    return NextResponse.json(
      { error: "Remove or reassign users linked to this department before deleting it." },
      { status: 400 },
    );
  }

  if (!existing.parentId && existing.subunits.length > 0) {
    const subAssigned = await prisma.projectOrgUser.count({
      where: { projectId, subunitId: { in: existing.subunits.map((s) => s.id) } },
    });
    if (subAssigned > 0) {
      return NextResponse.json(
        { error: "Remove or reassign users linked to subunits before deleting this department." },
        { status: 400 },
      );
    }
  }

  await prisma.projectOrgDepartment.delete({ where: { id: departmentId } });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_DEPARTMENT_DELETED,
    actorUserId: user.id,
    meta: { projectId, departmentId, name: existing.name },
  });

  return NextResponse.json({ ok: true });
}
