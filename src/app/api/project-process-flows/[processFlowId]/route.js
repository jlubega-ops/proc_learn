import { NextResponse } from "next/server";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { canManageProjectProcessFlows } from "@/lib/project-process-flow-access";
import {
  processFlowSelect,
  serializeProjectOrgProcessFlow,
} from "@/lib/projects/org-process-flows";
import { validateProjectOrgProcessFlowPatch } from "@/lib/validation/project-org-process-flow";

export const runtime = "nodejs";

function forbidden() {
  return NextResponse.json({ error: "Forbidden." }, { status: 403 });
}

export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user || !canManageProjectProcessFlows(sessionActiveRole(user))) return forbidden();

  const params = await context.params;
  const processFlowId = String(params?.processFlowId || "").trim();
  if (!processFlowId) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const existing = await prisma.projectOrgProcessFlow.findUnique({
    where: { id: processFlowId },
    select: processFlowSelect,
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validated = validateProjectOrgProcessFlowPatch(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validated.errors },
      { status: 400 },
    );
  }

  const row = await prisma.projectOrgProcessFlow.update({
    where: { id: processFlowId },
    data: validated.data,
    select: processFlowSelect,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROCESS_FLOW_UPDATED,
    actorUserId: user.id,
    meta: { processFlowId: row.id, name: row.name },
  });

  return NextResponse.json({ processFlow: serializeProjectOrgProcessFlow(row) });
}

export async function DELETE(_request, context) {
  const user = await getSessionUser();
  if (!user || !canManageProjectProcessFlows(sessionActiveRole(user))) return forbidden();

  const params = await context.params;
  const processFlowId = String(params?.processFlowId || "").trim();
  if (!processFlowId) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const existing = await prisma.projectOrgProcessFlow.findUnique({
    where: { id: processFlowId },
    select: { id: true, name: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.projectOrgProcessFlow.delete({ where: { id: processFlowId } });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROCESS_FLOW_DELETED,
    actorUserId: user.id,
    meta: { processFlowId, name: existing.name },
  });

  return NextResponse.json({ ok: true });
}
