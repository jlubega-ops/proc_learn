import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import {
  requisitionInclude,
  serializeRequisition,
  submitRequisition,
} from "@/lib/projects/requisitions";
import { healMissingStepTasks } from "@/lib/projects/workflow-engine";

export const runtime = "nodejs";

export async function GET(_request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const requisitionId = String(params?.requisitionId || "").trim();
  if (!projectId || !requisitionId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_REQUISITIONS,
  });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }

  if (auth.type === "org") {
    try {
      await healMissingStepTasks(prisma, projectId);
    } catch {
      // Non-fatal
    }
  }

  const row = await prisma.projectOrgRequisition.findFirst({
    where: { id: requisitionId, projectId },
    include: {
      ...requisitionInclude,
      instances: {
        include: {
          actions: { orderBy: { createdAt: "asc" } },
          tasks: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  /** @type {any} */
  let pendingTask = null;
  if (auth.type === "org") {
    pendingTask = await prisma.projectOrgWorkflowTask.findFirst({
      where: {
        projectId,
        assigneeOrgUserId: auth.orgUser.id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        instance: { requisitionId },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        requiredRoleName: true,
        status: true,
        stepNumber: true,
        processFlowItem: { select: { actionKey: true } },
      },
    });
  }

  return NextResponse.json({
    requisition: serializeRequisition(row),
    pendingTask: pendingTask
      ? {
          ...pendingTask,
          actionKey: pendingTask.processFlowItem?.actionKey || null,
        }
      : null,
    history: (row.instances || []).flatMap((inst) =>
      (inst.actions || []).map((a) => ({
        id: a.id,
        decision: a.decision,
        comment: a.comment,
        actorRoleName: a.actorRoleName,
        previousStatus: a.previousStatus,
        newStatus: a.newStatus,
        createdAt: a.createdAt,
      })),
    ),
  });
}

export async function POST(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const requisitionId = String(params?.requisitionId || "").trim();
  if (!projectId || !requisitionId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.CREATE_REQUISITION,
  });
  if (!auth.ok || auth.type !== "org") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body?.action !== "submit") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  const submitted = await submitRequisition(prisma, {
    requisitionId,
    projectId,
    actorOrgUserId: auth.orgUser.id,
    actorRoleName: auth.orgUser.projectOrgRole?.name || "User Department Officer",
  });
  if (!submitted.ok) {
    return NextResponse.json(
      { error: submitted.error, code: submitted.code },
      { status: submitted.status || 400 },
    );
  }
  return NextResponse.json(submitted);
}
