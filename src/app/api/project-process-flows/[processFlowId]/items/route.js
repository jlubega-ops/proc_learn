import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import {
  canManageProjectProcessFlows,
  canViewProjectProcessFlows,
} from "@/lib/project-process-flow-access";
import { listAssignableProjectOrgRoles, getAssignableProjectOrgRole } from "@/lib/projects/org-users";
import {
  processFlowItemSelect,
  serializeProjectOrgProcessFlowItem,
} from "@/lib/projects/org-process-flows";
import { validateProjectOrgProcessFlowItemInput } from "@/lib/validation/project-org-process-flow-item";

import { BUILT_IN_PROCESS_LOCKED_MESSAGE, isBuiltInProcessCode } from "@/lib/projects/process-catalogue";

export const runtime = "nodejs";

async function resolveProcessFlow(processFlowId) {
  return prisma.projectOrgProcessFlow.findUnique({
    where: { id: processFlowId },
    select: { id: true, name: true, code: true },
  });
}

export async function GET(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (!canViewProjectProcessFlows(activeRole)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const processFlowId = String(params?.processFlowId || "").trim();
  if (!processFlowId) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const processFlow = await resolveProcessFlow(processFlowId);
  if (!processFlow) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSizeRaw = Number(searchParams.get("pageSize") || 10);
  const pageSize = Math.min(50, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10));
  const skip = (page - 1) * pageSize;

  const where = { processFlowId };

  const [total, rows, assignableRoles] = await Promise.all([
    prisma.projectOrgProcessFlowItem.count({ where }),
    prisma.projectOrgProcessFlowItem.findMany({
      where,
      orderBy: [{ stepNumber: "asc" }, { createdAt: "asc" }],
      skip,
      take: pageSize,
      select: processFlowItemSelect,
    }),
    listAssignableProjectOrgRoles(prisma),
  ]);

  return NextResponse.json({
    processFlow,
    items: rows.map((row) => serializeProjectOrgProcessFlowItem(row)),
    assignableRoles,
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    canManage: canManageProjectProcessFlows(activeRole),
  });
}

export async function POST(request, context) {
  const user = await getSessionUser();
  if (!user || !canManageProjectProcessFlows(sessionActiveRole(user))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const processFlowId = String(params?.processFlowId || "").trim();
  if (!processFlowId) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const processFlow = await resolveProcessFlow(processFlowId);
  if (!processFlow) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (isBuiltInProcessCode(processFlow.code)) {
    return NextResponse.json({ error: BUILT_IN_PROCESS_LOCKED_MESSAGE }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validated = validateProjectOrgProcessFlowItemInput(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validated.errors },
      { status: 400 },
    );
  }

  const role = await getAssignableProjectOrgRole(prisma, validated.data.projectOrgRoleId);
  if (!role) {
    return NextResponse.json(
      {
        error: "Selected role is not available.",
        fieldErrors: { projectOrgRoleId: "Choose a valid organisation role." },
      },
      { status: 400 },
    );
  }

  const duplicate = await prisma.projectOrgProcessFlowItem.findFirst({
    where: { processFlowId, stepNumber: validated.data.stepNumber },
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

  const row = await prisma.projectOrgProcessFlowItem.create({
    data: {
      processFlowId,
      stepNumber: validated.data.stepNumber,
      taskDescription: validated.data.taskDescription,
      projectOrgRoleId: role.id,
    },
    select: processFlowItemSelect,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROCESS_FLOW_ITEM_CREATED,
    actorUserId: user.id,
    meta: {
      processFlowId,
      processFlowItemId: row.id,
      stepNumber: row.stepNumber,
      processName: processFlow.name,
    },
  });

  return NextResponse.json({ item: serializeProjectOrgProcessFlowItem(row) }, { status: 201 });
}
