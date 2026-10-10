import { NextResponse } from "next/server";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { canManageProjectProcessFlows } from "@/lib/project-process-flow-access";
import { getAssignableProjectOrgRole } from "@/lib/projects/org-users";
import {
  processFlowItemSelect,
  serializeProjectOrgProcessFlowItem,
} from "@/lib/projects/org-process-flows";
import { validateProjectOrgProcessFlowItemPatch } from "@/lib/validation/project-org-process-flow-item";

import { BUILT_IN_PROCESS_LOCKED_MESSAGE, isBuiltInProcessCode } from "@/lib/projects/process-catalogue";

export const runtime = "nodejs";

/** @param {string} processFlowId */
async function isBuiltInFlow(processFlowId) {
  const flow = await prisma.projectOrgProcessFlow.findUnique({
    where: { id: processFlowId },
    select: { code: true },
  });
  return isBuiltInProcessCode(flow?.code);
}

async function resolveItem(processFlowId, itemId) {
  return prisma.projectOrgProcessFlowItem.findFirst({
    where: { id: itemId, processFlowId },
    select: processFlowItemSelect,
  });
}

export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user || !canManageProjectProcessFlows(sessionActiveRole(user))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const processFlowId = String(params?.processFlowId || "").trim();
  const itemId = String(params?.itemId || "").trim();
  if (!processFlowId || !itemId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const existing = await resolveItem(processFlowId, itemId);
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (await isBuiltInFlow(processFlowId)) {
    return NextResponse.json({ error: BUILT_IN_PROCESS_LOCKED_MESSAGE }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validated = validateProjectOrgProcessFlowItemPatch(body);
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
          fieldErrors: { projectOrgRoleId: "Choose a valid organisation role." },
        },
        { status: 400 },
      );
    }
    validated.data.projectOrgRoleId = role.id;
  }

  if (validated.data.stepNumber !== undefined) {
    const duplicate = await prisma.projectOrgProcessFlowItem.findFirst({
      where: {
        processFlowId,
        stepNumber: validated.data.stepNumber,
        NOT: { id: itemId },
      },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        {
          error: "This step number is already used in this process.",
          fieldErrors: { stepNumber: "Choose a different step number." },
        },
        { status: 400 },
      );
    }
  }

  const row = await prisma.projectOrgProcessFlowItem.update({
    where: { id: itemId },
    data: validated.data,
    select: processFlowItemSelect,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROCESS_FLOW_ITEM_UPDATED,
    actorUserId: user.id,
    meta: { processFlowId, processFlowItemId: row.id, stepNumber: row.stepNumber },
  });

  return NextResponse.json({ item: serializeProjectOrgProcessFlowItem(row) });
}

export async function DELETE(_request, context) {
  const user = await getSessionUser();
  if (!user || !canManageProjectProcessFlows(sessionActiveRole(user))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const processFlowId = String(params?.processFlowId || "").trim();
  const itemId = String(params?.itemId || "").trim();
  if (!processFlowId || !itemId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const existing = await resolveItem(processFlowId, itemId);
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (await isBuiltInFlow(processFlowId)) {
    return NextResponse.json({ error: BUILT_IN_PROCESS_LOCKED_MESSAGE }, { status: 400 });
  }

  await prisma.projectOrgProcessFlowItem.delete({ where: { id: itemId } });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROCESS_FLOW_ITEM_DELETED,
    actorUserId: user.id,
    meta: { processFlowId, processFlowItemId: itemId, stepNumber: existing.stepNumber },
  });

  return NextResponse.json({ ok: true });
}
