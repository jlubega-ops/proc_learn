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
  /** @type {any} */
  let workflowStage = null;
  /** @type {any} */
  let lastDecision = null;
  let viewerHasPendingAction = false;

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
    viewerHasPendingAction = Boolean(pendingTask);

    const openTask = await prisma.projectOrgWorkflowTask.findFirst({
      where: {
        projectId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        instance: { requisitionId },
      },
      orderBy: [{ stepNumber: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        requiredRoleName: true,
        status: true,
        stepNumber: true,
      },
    });
    if (openTask) {
      workflowStage = {
        taskId: openTask.id,
        title: openTask.title,
        requiredRoleName: openTask.requiredRoleName || null,
        stepNumber: openTask.stepNumber,
        status: openTask.status,
      };
    }

    const historyFlat = (row.instances || []).flatMap((inst) =>
      (inst.actions || []).map((a) => ({
        decision: a.decision,
        actorRoleName: a.actorRoleName,
        createdAt: a.createdAt,
      })),
    );
    if (historyFlat.length) {
      const latest = historyFlat[historyFlat.length - 1];
      lastDecision = {
        decision: latest.decision,
        actorRoleName: latest.actorRoleName || null,
      };
    }
  }

  return NextResponse.json({
    requisition: serializeRequisition({
      ...row,
      workflowStage,
      lastDecision,
      viewerHasPendingAction,
    }),
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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body?.action === "save_form5_part_i" || body?.action === "save_form5_part_ii") {
    const auth = await authorizeProjectApiAccess(prisma, {
      projectId,
      orgPermission: ORG_PERMISSION.VIEW_REQUISITIONS,
    });
    if (!auth.ok || auth.type !== "org") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const { saveRequisitionForm5 } = await import("@/lib/projects/requisitions");
    const saved = await saveRequisitionForm5(prisma, {
      projectId,
      requisitionId,
      actorOrgUserId: auth.orgUser.id,
      part: body.action === "save_form5_part_i" ? "I" : "II",
      body: body.form5 || body,
      method: typeof body.procurementMethod === "string" ? body.procurementMethod : null,
    });
    if (!saved.ok) {
      return NextResponse.json(
        { error: saved.error, fieldErrors: saved.fieldErrors },
        { status: saved.status || 400 },
      );
    }
    return NextResponse.json(saved);
  }

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.CREATE_REQUISITION,
  });
  if (!auth.ok || auth.type !== "org") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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
