import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import { authorizeProjectOrgRead } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import {
  processFlowItemSelect,
  processFlowSelect,
  serializeProjectOrgProcessFlowItem,
} from "@/lib/projects/org-process-flows";
import {
  processFlowAdoptionSelect,
  serializeCatalogueProcessFlow,
  serializeProjectOrgProcessFlowAdoption,
} from "@/lib/projects/org-process-flow-adoptions";
import { migrateLegacyProcessAdoptions } from "@/lib/projects/process-catalogue";
import { resolveAllowedProcessCodesForOrgProject } from "@/lib/academic/assessment-config";
import { loadProcessActivation } from "@/lib/projects/process-activation";
import {
  processActivationBlockers,
  processCodeOfFlow,
} from "@/lib/projects/process-dependencies";

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

  try {
    await migrateLegacyProcessAdoptions(prisma, { projectId });
  } catch {
    // Non-fatal: still return catalogue as stored.
  }

  const canAdopt = auth.type === "platform" && !auth.readOnly;

  const [adoptedRows, catalogueRows, allItems] = await Promise.all([
    prisma.projectOrgProcessFlowAdoption.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }],
      select: processFlowAdoptionSelect,
    }),
    prisma.projectOrgProcessFlow.findMany({
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      select: processFlowSelect,
    }),
    prisma.projectOrgProcessFlowItem.findMany({
      orderBy: [{ processFlowId: "asc" }, { stepNumber: "asc" }, { createdAt: "asc" }],
      select: {
        ...processFlowItemSelect,
        processFlowId: true,
      },
    }),
  ]);

  /** @type {Map<string, any[]>} */
  const itemsByFlowId = new Map();
  for (const item of allItems) {
    const list = itemsByFlowId.get(item.processFlowId) || [];
    list.push(serializeProjectOrgProcessFlowItem(item));
    itemsByFlowId.set(item.processFlowId, list);
  }

  const adoptionByFlowId = new Map(adoptedRows.map((row) => [row.processFlowId, row]));

  const allowedCodes = await resolveAllowedProcessCodesForOrgProject(prisma, projectId);
  const catalogueFiltered =
    allowedCodes == null
      ? catalogueRows
      : catalogueRows.filter((row) => !row.code || allowedCodes.includes(row.code));

  return NextResponse.json({
    adopted: adoptedRows.map((row) => ({
      ...serializeProjectOrgProcessFlowAdoption(row),
      items: itemsByFlowId.get(row.processFlowId) || [],
    })),
    adoptedTotal: adoptedRows.length,
    catalogue: catalogueFiltered.map((row) => ({
      ...serializeCatalogueProcessFlow(row, adoptionByFlowId),
      items: itemsByFlowId.get(row.id) || [],
    })),
    total: catalogueFiltered.length,
    canAdopt,
    restrictedByExaminer: allowedCodes != null,
    allowedProcessCodes: allowedCodes,
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
    select: { id: true, name: true, code: true, triggerKey: true },
  });
  if (!processFlow) {
    return NextResponse.json(
      { error: "Selected process is not available.", fieldErrors: { processFlowId: "Choose a valid process." } },
      { status: 400 },
    );
  }

  const allowedCodes = await resolveAllowedProcessCodesForOrgProject(prisma, projectId);
  if (allowedCodes && processFlow.code && !allowedCodes.includes(processFlow.code)) {
    return NextResponse.json(
      {
        error: "This process is not available for this project.",
        fieldErrors: { processFlowId: "The examiner did not allow this process." },
      },
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
        error: "This process is already activated for your organisation.",
        fieldErrors: { processFlowId: "This process is already activated." },
      },
      { status: 400 },
    );
  }

  const code = processCodeOfFlow(processFlow);
  if (code) {
    const { active, names } = await loadProcessActivation(prisma, projectId);
    const blockers = processActivationBlockers(code, active, names);
    if (blockers.length) {
      return NextResponse.json({ error: blockers[0], code: "PROCESS_DEPENDENCY" }, { status: 400 });
    }
  }

  const row = await prisma.projectOrgProcessFlowAdoption.create({
    data: {
      projectId,
      processFlowId,
      isActive: true,
      activatedAt: new Date(),
    },
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
