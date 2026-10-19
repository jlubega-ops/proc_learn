import { NextResponse } from "next/server";
import { OrgWorkflowDecision } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import {
  actOnProcurementPlanTask,
  deleteProcurementPlanByCreator,
  getCreatorProcurementPlanMutationFlags,
  procurementPlanInclude,
  serializeProcurementPlan,
  submitProcurementPlan,
} from "@/lib/projects/procurement-plans";
import { healMissingStepTasks } from "@/lib/projects/workflow-engine";
import {
  WORKFLOW_HISTORY_ACTION_SELECT,
  attachCommitteeNames,
  loadPrintOrganisation,
  mapWorkflowHistoryActions,
  printedByFromAuth,
} from "@/lib/projects/print-context";

export const runtime = "nodejs";

const PLAN_DECISIONS = new Set([
  OrgWorkflowDecision.APPROVE,
  OrgWorkflowDecision.RETURN,
  OrgWorkflowDecision.REJECT,
]);

export async function GET(_request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const planId = String(params?.planId || "").trim();
  if (!projectId || !planId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_PROCUREMENT_PLANS,
  });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }

  const row = await prisma.projectOrgProcurementPlan.findFirst({
    where: { id: planId, projectId },
    include: procurementPlanInclude,
  });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (auth.type === "org") {
    const role = auth.orgUser.projectOrgRole?.name || "";
    if (
      (role === "User Department Officer" ||
        role === "User Department" ||
        role === "Head User Department" ||
        role === "Head of User Department") &&
      auth.orgUser.departmentId &&
      row.departmentId &&
      row.departmentId !== auth.orgUser.departmentId
    ) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    try {
      await healMissingStepTasks(prisma, projectId);
    } catch {
      // Non-fatal
    }
  }

  /** @type {any} */
  let pendingTask = null;
  /** @type {any[]} */
  let workflowHistory = [];
  let canSubmit = false;
  let canEdit = false;
  let canDelete = false;
  let awaitingHodReview = false;
  /** @type {any} */
  let workflowStage = null;
  /** @type {any} */
  let lastDecision = null;
  let viewerHasPendingAction = false;

  const [organisation, instance, openTask] = await Promise.all([
    loadPrintOrganisation(prisma, projectId),
    prisma.projectOrgWorkflowInstance.findFirst({
      where: {
        projectId,
        procurementPlanId: planId,
        status: {
          in: ["ACTIVE", "IN_PROGRESS", "SUSPENDED", "COMPLETED", "CANCELLED"],
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        actions: {
          orderBy: { createdAt: "asc" },
          select: WORKFLOW_HISTORY_ACTION_SELECT,
        },
      },
    }),
    prisma.projectOrgWorkflowTask.findFirst({
      where: {
        projectId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        instance: { procurementPlanId: planId },
      },
      orderBy: [{ stepNumber: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        requiredRoleName: true,
        status: true,
        stepNumber: true,
      },
    }),
  ]);

  workflowHistory = await attachCommitteeNames(
    prisma,
    mapWorkflowHistoryActions(instance?.actions),
  );
  const latestAction = workflowHistory.length
    ? workflowHistory[workflowHistory.length - 1]
    : null;
  if (latestAction) {
    lastDecision = {
      decision: latestAction.decision,
      actorRoleName: latestAction.actorRoleName || null,
    };
  }
  if (openTask) {
    workflowStage = {
      title: openTask.title,
      requiredRoleName: openTask.requiredRoleName || null,
      stepNumber: openTask.stepNumber,
      status: openTask.status,
    };
  }

  if (auth.type === "org") {
    const orgUserId = auth.orgUser.id;
    const role = auth.orgUser.projectOrgRole?.name || "";
    const flags = await getCreatorProcurementPlanMutationFlags(prisma, {
      projectId,
      plan: row,
      actorOrgUserId: orgUserId,
    });
    canEdit = flags.canEdit;
    canDelete = flags.canDelete;
    awaitingHodReview = flags.awaitingHodReview;
    canSubmit =
      (role === "User Department Officer" || role === "User Department") &&
      (row.status === "DRAFT" || row.status === "RETURNED") &&
      (!row.createdByOrgUserId || row.createdByOrgUserId === orgUserId);

    pendingTask = await prisma.projectOrgWorkflowTask.findFirst({
      where: {
        projectId,
        assigneeOrgUserId: orgUserId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        instance: { procurementPlanId: planId },
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
  }

  return NextResponse.json({
    plan: serializeProcurementPlan({
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
    workflowHistory,
    organisation,
    printedBy: printedByFromAuth(auth),
    canSubmit,
    canEdit,
    canDelete,
    awaitingHodReview,
  });
}

export async function DELETE(_request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const planId = String(params?.planId || "").trim();
  if (!projectId || !planId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_PROCUREMENT_PLANS,
  });
  if (!auth.ok || auth.type !== "org") {
    return NextResponse.json(
      { error: auth.ok ? "Forbidden." : "Not found." },
      { status: auth.ok ? 403 : auth.status || 404 },
    );
  }
  const roleName = auth.orgUser.projectOrgRole?.name || "";
  if (roleName !== "User Department Officer" && roleName !== "User Department") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const result = await deleteProcurementPlanByCreator(prisma, {
    projectId,
    planId,
    actorOrgUserId: auth.orgUser.id,
    actorRoleName: roleName,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status || 400 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const planId = String(params?.planId || "").trim();
  if (!projectId || !planId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  if (body?.action === "submit") {
    const auth = await authorizeProjectApiAccess(prisma, {
      projectId,
      orgPermission: ORG_PERMISSION.VIEW_PROCUREMENT_PLANS,
    });
    if (!auth.ok || auth.type !== "org") {
      return NextResponse.json(
        { error: auth.ok ? "Forbidden." : "Not found." },
        { status: auth.ok ? 403 : auth.status || 404 },
      );
    }
    const result = await submitProcurementPlan(prisma, {
      projectId,
      planId,
      actorOrgUserId: auth.orgUser.id,
      actorRoleName: auth.orgUser.projectOrgRole?.name || "",
      actorDepartmentId: auth.orgUser.departmentId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status || 400 },
      );
    }
    return NextResponse.json(result);
  }

  if (body?.action === "decide") {
    const auth = await authorizeProjectApiAccess(prisma, {
      projectId,
      orgPermission: ORG_PERMISSION.VIEW_TASKS,
    });
    if (!auth.ok || auth.type !== "org") {
      return NextResponse.json(
        { error: auth.ok ? "Forbidden." : "Not found." },
        { status: auth.ok ? 403 : auth.status || 404 },
      );
    }
    const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
    if (!taskId)
      return NextResponse.json(
        { error: "Task id is required." },
        { status: 400 },
      );
    if (!PLAN_DECISIONS.has(body.decision)) {
      return NextResponse.json(
        { error: "Choose approve, return or reject." },
        { status: 400 },
      );
    }
    const task = await prisma.projectOrgWorkflowTask.findFirst({
      where: { id: taskId, projectId, instance: { procurementPlanId: planId } },
      select: { id: true },
    });
    if (!task)
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    const result = await actOnProcurementPlanTask(prisma, {
      projectId,
      taskId,
      actorOrgUserId: auth.orgUser.id,
      actorRoleName: auth.orgUser.projectOrgRole?.name || "",
      actorDepartmentId: auth.orgUser.departmentId || null,
      decision: body.decision,
      comment: typeof body.comment === "string" ? body.comment : "",
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status || 400 },
      );
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
