import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import { authorizeProjectOrgRead } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import { processFlowSelect } from "@/lib/projects/org-process-flows";
import {
  processFlowAdoptionSelect,
  serializeCatalogueProcessFlow,
  serializeProjectOrgProcessFlowAdoption,
} from "@/lib/projects/org-process-flow-adoptions";

export const runtime = "nodejs";

export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProjectOrgRead(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_PROCESS_WORKFLOW,
  });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }

  const canAdopt = auth.type === "platform" && !auth.readOnly;

  const [adoptedRows, catalogueRows] = await Promise.all([
    prisma.projectOrgProcessFlowAdoption.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }],
      select: processFlowAdoptionSelect,
    }),
    prisma.projectOrgProcessFlow.findMany({
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      select: processFlowSelect,
    }),
  ]);

  const adoptedIds = new Set(adoptedRows.map((row) => row.processFlowId));

  return NextResponse.json({
    adopted: adoptedRows.map((row) => serializeProjectOrgProcessFlowAdoption(row)),
    adoptedTotal: adoptedRows.length,
    catalogue: catalogueRows.map((row) => serializeCatalogueProcessFlow(row, adoptedIds)),
    total: catalogueRows.length,
    canAdopt,
  });
}

export async function POST(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

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

  const processFlowId = typeof body?.processFlowId === "string" ? body.processFlowId.trim() : "";
  if (!processFlowId) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: { processFlowId: "Choose a process." } },
      { status: 400 },
    );
  }

  const processFlow = await prisma.projectOrgProcessFlow.findUnique({
    where: { id: processFlowId },
    select: { id: true, name: true },
  });
  if (!processFlow) {
    return NextResponse.json(
      { error: "Selected process is not available.", fieldErrors: { processFlowId: "Choose a valid process." } },
      { status: 400 },
    );
  }

  const existing = await prisma.projectOrgProcessFlowAdoption.findUnique({
    where: { projectId_processFlowId: { projectId, processFlowId } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: "This process has already been added to your organisation.",
        fieldErrors: { processFlowId: "Each process can only be added once." },
      },
      { status: 400 },
    );
  }

  const row = await prisma.projectOrgProcessFlowAdoption.create({
    data: { projectId, processFlowId },
    select: processFlowAdoptionSelect,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROCESS_FLOW_ADOPTED,
    actorUserId: user.id,
    meta: { projectId, processFlowId, adoptionId: row.id, processName: processFlow.name },
  });

  return NextResponse.json(
    { adoption: serializeProjectOrgProcessFlowAdoption(row) },
    { status: 201 },
  );
}
