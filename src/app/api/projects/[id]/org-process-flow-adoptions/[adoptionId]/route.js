import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import {
  processFlowAdoptionSelect,
  serializeProjectOrgProcessFlowAdoption,
} from "@/lib/projects/org-process-flow-adoptions";

export const runtime = "nodejs";

export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const adoptionId = String(params?.adoptionId || "").trim();
  if (!projectId || !adoptionId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const auth = await authorizeProjectOrgAdmin(prisma, {
    projectId,
    userId: user.id,
    activeRole,
  });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const existing = await prisma.projectOrgProcessFlowAdoption.findFirst({
    where: { id: adoptionId, projectId },
    select: processFlowAdoptionSelect,
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (typeof body?.isActive !== "boolean") {
    return NextResponse.json(
      { error: "Please provide isActive true or false." },
      { status: 400 },
    );
  }

  const now = new Date();
  const row = await prisma.projectOrgProcessFlowAdoption.update({
    where: { id: adoptionId },
    data: body.isActive
      ? { isActive: true, activatedAt: now, deactivatedAt: null }
      : { isActive: false, deactivatedAt: now },
    select: processFlowAdoptionSelect,
  });

  await writeAuditLog({
    eventType: body.isActive
      ? AuditEvent.PROJECT_ORG_PROCESS_FLOW_ADOPTED
      : AuditEvent.PROJECT_ORG_PROCESS_FLOW_ADOPTION_REMOVED,
    actorUserId: user.id,
    meta: {
      projectId,
      adoptionId,
      processFlowId: row.processFlowId,
      processName: row.processFlow?.name || "",
      action: body.isActive ? "activated" : "deactivated",
    },
  });

  return NextResponse.json({
    adoption: serializeProjectOrgProcessFlowAdoption(row),
  });
}

export async function DELETE(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const adoptionId = String(params?.adoptionId || "").trim();
  if (!projectId || !adoptionId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const auth = await authorizeProjectOrgAdmin(prisma, {
    projectId,
    userId: user.id,
    activeRole,
  });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }

  const existing = await prisma.projectOrgProcessFlowAdoption.findFirst({
    where: { id: adoptionId, projectId },
    select: {
      id: true,
      processFlowId: true,
      processFlow: { select: { name: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.projectOrgProcessFlowAdoption.delete({ where: { id: adoptionId } });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROCESS_FLOW_ADOPTION_REMOVED,
    actorUserId: user.id,
    meta: {
      projectId,
      adoptionId,
      processFlowId: existing.processFlowId,
      processName: existing.processFlow?.name || "",
    },
  });

  return NextResponse.json({ ok: true });
}
