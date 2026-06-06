import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { resolveOrgUserDepartmentAssignment } from "@/lib/projects/org-departments";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import {
  getAssignableProjectOrgRole,
  orgUserInclude,
  serializeProjectOrgUser,
} from "@/lib/projects/org-users";
import { validateProjectOrgUserPatch } from "@/lib/validation/project-org-user";
import { ensureProjectCode } from "@/lib/projects/project-identity";

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
  const orgUserId = String(params?.orgUserId || "").trim();
  if (!projectId || !orgUserId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const denied = await requireOrgAdmin(prisma, {
    projectId,
    userId: user.id,
    activeRole,
  });
  if (denied) return denied;

  const existing = await prisma.projectOrgUser.findFirst({
    where: { id: orgUserId, projectId },
    include: orgUserInclude,
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (existing.isProjectAdmin) {
    return NextResponse.json(
      { error: "Your Admin account cannot be edited here." },
      { status: 400 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validated = validateProjectOrgUserPatch(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validated.errors },
      { status: 400 },
    );
  }

  if (validated.data.projectOrgRoleId) {
    const role = await getAssignableProjectOrgRole(prisma, String(validated.data.projectOrgRoleId));
    if (!role) {
      return NextResponse.json(
        {
          error: "Selected role is not available.",
          fieldErrors: { projectOrgRoleId: "Choose an active role other than Admin." },
        },
        { status: 400 },
      );
    }
  }

  const nextDepartmentId =
    validated.data.departmentId !== undefined
      ? String(validated.data.departmentId)
      : existing.departmentId;
  const nextSubunitId =
    validated.data.subunitId !== undefined
      ? validated.data.subunitId
      : existing.subunitId;

  if (
    validated.data.departmentId !== undefined ||
    validated.data.subunitId !== undefined
  ) {
    const dept = await resolveOrgUserDepartmentAssignment(
      prisma,
      projectId,
      nextDepartmentId || "",
      nextSubunitId,
    );
    if (!dept.ok) {
      return NextResponse.json(
        { error: "Please fix the highlighted fields.", fieldErrors: dept.errors },
        { status: 400 },
      );
    }
    validated.data.departmentId = dept.data.departmentId;
    validated.data.subunitId = dept.data.subunitId;
  }

  const row = await prisma.projectOrgUser.update({
    where: { id: orgUserId },
    data: validated.data,
    include: orgUserInclude,
  });

  const projectCode = await ensureProjectCode(prisma, projectId);

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_USER_UPDATED,
    actorUserId: user.id,
    meta: { projectId, projectOrgUserId: row.id, email: row.email, unitIdentifier: row.unitIdentifier },
  });

  return NextResponse.json({ user: serializeProjectOrgUser(row, null, projectCode) });
}

export async function DELETE(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const orgUserId = String(params?.orgUserId || "").trim();
  if (!projectId || !orgUserId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const denied = await requireOrgAdmin(prisma, {
    projectId,
    userId: user.id,
    activeRole,
  });
  if (denied) return denied;

  const existing = await prisma.projectOrgUser.findFirst({
    where: { id: orgUserId, projectId },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (existing.isProjectAdmin) {
    return NextResponse.json(
      { error: "Your Admin account cannot be deleted." },
      { status: 400 },
    );
  }

  await prisma.projectOrgUser.delete({ where: { id: orgUserId } });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_USER_DELETED,
    actorUserId: user.id,
    meta: { projectId, projectOrgUserId: orgUserId, email: existing.email },
  });

  return NextResponse.json({ ok: true });
}
