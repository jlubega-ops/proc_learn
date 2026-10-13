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
import {
  BUILT_IN_PROCESS_LOCKED_MESSAGE,
  isBuiltInProcessCode,
} from "@/lib/projects/process-catalogue";
import {
  IN_USE_MESSAGE,
  isForeignKeyViolation,
  processFlowDeleteBlocker,
} from "@/lib/projects/delete-guards";

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

  if (isBuiltInProcessCode(existing.code)) {
    const changesOtherThanName = Object.entries(validated.data).some(
      ([key, value]) => key !== "name" && (value ?? null) !== (existing[key] ?? null),
    );
    if (changesOtherThanName) {
      return NextResponse.json({ error: BUILT_IN_PROCESS_LOCKED_MESSAGE }, { status: 400 });
    }
  }

  if (validated.data.triggerKey) {
    const clash = await prisma.projectOrgProcessFlow.findFirst({
      where: {
        triggerKey: String(validated.data.triggerKey),
        NOT: { id: processFlowId },
      },
      select: { id: true, name: true },
    });
    if (clash) {
      return NextResponse.json(
        {
          error: `Engine event already used by “${clash.name}”.`,
          fieldErrors: { engineEvent: `Already bound to “${clash.name}”.` },
        },
        { status: 400 },
      );
    }
  }

  if (validated.data.code) {
    const codeClash = await prisma.projectOrgProcessFlow.findFirst({
      where: {
        code: String(validated.data.code),
        NOT: { id: processFlowId },
      },
      select: { id: true, name: true },
    });
    if (codeClash) {
      return NextResponse.json(
        {
          error: `Process code already used by “${codeClash.name}”.`,
          fieldErrors: { engineEvent: `Code already used by “${codeClash.name}”.` },
        },
        { status: 400 },
      );
    }
  }

  const row = await prisma.projectOrgProcessFlow.update({
    where: { id: processFlowId },
    data: validated.data,
    select: processFlowSelect,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROCESS_FLOW_UPDATED,
    actorUserId: user.id,
    meta: {
      processFlowId: row.id,
      name: row.name,
      code: row.code,
      triggerKey: row.triggerKey,
    },
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
    select: { id: true, name: true, code: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (isBuiltInProcessCode(existing.code)) {
    return NextResponse.json({ error: "Built-in processes cannot be deleted." }, { status: 400 });
  }

  const blocker = await processFlowDeleteBlocker(prisma, processFlowId);
  if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });

  try {
    await prisma.projectOrgProcessFlow.delete({ where: { id: processFlowId } });
  } catch (e) {
    if (isForeignKeyViolation(e)) return NextResponse.json({ error: IN_USE_MESSAGE }, { status: 409 });
    throw e;
  }

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROCESS_FLOW_DELETED,
    actorUserId: user.id,
    meta: { processFlowId, name: existing.name },
  });

  return NextResponse.json({ ok: true });
}
