import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import {
  canManageProjectProcessFlows,
  canViewProjectProcessFlows,
} from "@/lib/project-process-flow-access";
import {
  processFlowSelect,
  serializeProjectOrgProcessFlow,
} from "@/lib/projects/org-process-flows";
import { validateProjectOrgProcessFlowInput } from "@/lib/validation/project-org-process-flow";
import { ENGINE_PROCESS_BINDINGS } from "@/lib/projects/process-catalogue";

export const runtime = "nodejs";

export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (!canViewProjectProcessFlows(activeRole)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSizeRaw = Number(searchParams.get("pageSize") || 10);
  const pageSize = Math.min(50, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10));
  const skip = (page - 1) * pageSize;

  const [total, rows] = await Promise.all([
    prisma.projectOrgProcessFlow.count(),
    prisma.projectOrgProcessFlow.findMany({
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      skip,
      take: pageSize,
      select: processFlowSelect,
    }),
  ]);

  return NextResponse.json({
    processFlows: rows.map((row) => serializeProjectOrgProcessFlow(row)),
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    canManage: canManageProjectProcessFlows(activeRole),
    engineBindings: ENGINE_PROCESS_BINDINGS,
  });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || !canManageProjectProcessFlows(sessionActiveRole(user))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validated = validateProjectOrgProcessFlowInput(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validated.errors },
      { status: 400 },
    );
  }

  if (validated.data.triggerKey) {
    const clash = await prisma.projectOrgProcessFlow.findFirst({
      where: { triggerKey: validated.data.triggerKey },
      select: { id: true, name: true },
    });
    if (clash) {
      return NextResponse.json(
        {
          error: `Engine event already used by “${clash.name}”. Unbind that process first, or leave this one unbound.`,
          fieldErrors: {
            engineEvent: `Already bound to “${clash.name}”.`,
          },
        },
        { status: 400 },
      );
    }
  }

  if (validated.data.code) {
    const codeClash = await prisma.projectOrgProcessFlow.findFirst({
      where: { code: validated.data.code },
      select: { id: true, name: true },
    });
    if (codeClash) {
      return NextResponse.json(
        {
          error: `Process code ${validated.data.code} is already used by “${codeClash.name}”.`,
          fieldErrors: {
            engineEvent: `Code already used by “${codeClash.name}”.`,
          },
        },
        { status: 400 },
      );
    }
  }

  const row = await prisma.projectOrgProcessFlow.create({
    data: {
      name: validated.data.name,
      description: validated.data.description,
      code: validated.data.code,
      triggerKey: validated.data.triggerKey,
    },
    select: processFlowSelect,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROCESS_FLOW_CREATED,
    actorUserId: user.id,
    meta: {
      processFlowId: row.id,
      name: row.name,
      code: row.code,
      triggerKey: row.triggerKey,
    },
  });

  return NextResponse.json(
    { processFlow: serializeProjectOrgProcessFlow(row) },
    { status: 201 },
  );
}
