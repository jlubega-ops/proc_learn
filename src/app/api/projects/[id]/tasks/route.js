import { NextResponse } from "next/server";
import { OrgWorkflowDecision } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import { actOnRequisitionTask } from "@/lib/projects/requisitions";
import {
  buildRequisitionVerificationEvidence,
  requisitionInclude,
  serializeRequisition,
} from "@/lib/projects/requisitions";
import {
  actOnProcurementPlanTask,
  procurementPlanInclude,
  serializeProcurementPlan,
} from "@/lib/projects/procurement-plans";
import {
  actOnBudgetTask,
  budgetInclude,
  serializeBudget,
} from "@/lib/projects/budgets";
import { actOnProcurementTask } from "@/lib/projects/procurement-tasks";
import { healMissingStepTasks } from "@/lib/projects/workflow-engine";
import {
  procurementStageHref,
  procurementTaskStage,
} from "@/lib/projects/procurement-task-stage";
import {
  getActiveCommittee,
  checkActingModeForTask,
  partitionTasksForActingMode,
  committeeModeWorkspaceHint,
} from "@/lib/projects/committee-context";
import {
  isNextProcessHandoffTaskTitle,
  nextStepDetailHref,
} from "@/lib/projects/next-process-handoffs";

export const runtime = "nodejs";

export async function GET(_request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId)
    return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_TASKS,
  });
  if (!auth.ok || auth.type !== "org") {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth?.status || 403 },
    );
  }

  try {
    await healMissingStepTasks(prisma, projectId);
  } catch {
    // Non-fatal
  }

  const tasks = await prisma.projectOrgWorkflowTask.findMany({
    where: {
      projectId,
      assigneeOrgUserId: auth.orgUser.id,
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    orderBy: [{ createdAt: "asc" }],
    include: {
      processFlowItem: { select: { actionKey: true, taskDescription: true } },
      instance: {
        select: {
          id: true,
          entityType: true,
          entityId: true,
          requisitionId: true,
          procurementPlanId: true,
          budgetId: true,
          procurementId: true,
          status: true,
          actions: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              decision: true,
              comment: true,
              actorRoleName: true,
              previousStatus: true,
              newStatus: true,
              createdAt: true,
              metadata: true,
            },
          },
          requisition: { include: requisitionInclude },
          procurementPlan: { include: procurementPlanInclude },
          budget: { include: budgetInclude },
          procurement: {
            select: {
              id: true,
              procurementNumber: true,
              title: true,
              procurementMethod: true,
              status: true,
            },
          },
        },
      },
    },
  });

  const out = [];
  for (const t of tasks) {
    // Cross-process handoffs are bell notifications only — hide from My Tasks.
    if (isNextProcessHandoffTaskTitle(t.title)) continue;
    const req = t.instance?.requisition || null;
    const plan = t.instance?.procurementPlan || null;
    const budget = t.instance?.budget || null;
    const procurement = t.instance?.procurement || null;
    const evidence = req
      ? await buildRequisitionVerificationEvidence(prisma, req)
      : null;
    const actionKey =
      String(t.processFlowItem?.actionKey || "").toUpperCase() || null;
    out.push({
      id: t.id,
      title: t.title,
      stepNumber: t.stepNumber,
      requiredRoleName: t.requiredRoleName,
      actionKey,
      status: t.status,
      createdAt: t.createdAt,
      instanceId: t.instanceId,
      entityType: t.instance?.entityType || null,
      detailHref:
        nextStepDetailHref(projectId, t.title, procurement?.id || null) ||
        (procurement
          ? procurementStageHref(
              projectId,
              procurement.id,
              procurementTaskStage(t.title),
              procurement.procurementMethod,
            )
          : budget
            ? `/projects/${projectId}/budgets/${budget.id}`
            : plan
              ? `/projects/${projectId}/procurement-plans/${plan.id}`
              : req
                ? `/projects/${projectId}/requisitions/${req.id}`
                : null),
      requisition: req ? serializeRequisition(req) : null,
      procurementPlan: plan ? serializeProcurementPlan(plan) : null,
      budget: budget ? serializeBudget(budget) : null,
      procurement: procurement || null,
      evidence,
      history: t.instance?.actions || [],
    });
  }

  const activeCommittee = await getActiveCommittee(prisma, auth.orgUser.id);
  const partitioned = partitionTasksForActingMode(out, activeCommittee);

  return NextResponse.json({
    tasks: partitioned.visible,
    total: partitioned.visible.length,
    mode: partitioned.mode,
    hiddenCount: partitioned.hiddenCount,
    orgTaskCount: partitioned.orgTaskCount,
    activeCommittee: activeCommittee
      ? {
          id: activeCommittee.id,
          name: activeCommittee.name,
          committeeType: activeCommittee.committeeType,
        }
      : null,
  });
}

export async function POST(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId)
    return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const taskId = typeof body?.taskId === "string" ? body.taskId.trim() : "";
  const decision = String(body?.decision || "").trim();
  if (!taskId || !Object.values(OrgWorkflowDecision).includes(decision)) {
    return NextResponse.json(
      { error: "Task and decision are required." },
      { status: 400 },
    );
  }

  const taskMeta = await prisma.projectOrgWorkflowTask.findUnique({
    where: { id: taskId },
    select: {
      projectId: true,
      requiredRoleName: true,
      title: true,
      processFlowItem: { select: { actionKey: true } },
      instance: {
        select: {
          procurementPlanId: true,
          requisitionId: true,
          budgetId: true,
          procurementId: true,
        },
      },
    },
  });

  if (!taskMeta || taskMeta.projectId !== projectId) {
    return NextResponse.json(
      { error: "Task is not available." },
      { status: 404 },
    );
  }

  const actingMode = checkActingModeForTask(
    taskMeta,
    await getActiveCommittee(prisma, auth.orgUser.id),
  );
  if (!actingMode.ok) {
    return NextResponse.json(
      { error: actingMode.error, code: actingMode.code },
      { status: actingMode.status },
    );
  }

  // Every process's first step (Raise/Prepare) is a SUBMIT action. Budgets,
  // procurement plans, and requisitions only reach that step through their own
  // create/draft forms, so SUBMIT is rejected there — but a Micro/Quotation/
  // Tender procurement instance's own SUBMIT step (e.g. "Raise Micro
  // Procurement Request", "Prepare RFQ Documents") is actioned right here.
  const isProcurementSubmitStep =
    Boolean(taskMeta?.instance?.procurementId) &&
    String(taskMeta?.processFlowItem?.actionKey || "")
      .trim()
      .toUpperCase() === "SUBMIT";

  if (decision === "SUBMIT" && !isProcurementSubmitStep) {
    return NextResponse.json(
      {
        error:
          "Resubmit through the Budgets, Procurement Plans, or Requisitions form after correcting the draft.",
      },
      { status: 400 },
    );
  }

  const common = {
    taskId,
    actorOrgUserId: auth.orgUser.id,
    actorRoleName: auth.orgUser.projectOrgRole?.name || "",
    actorDepartmentId: auth.orgUser.departmentId || null,
    decision: /** @type {import("@prisma/client").OrgWorkflowDecision} */ (
      decision
    ),
    comment: typeof body?.comment === "string" ? body.comment : "",
    committeeId: auth.orgUser.activeCommitteeId || null,
    committeeRole: null,
  };

  // Resolve committee seat label when acting under an active committee.
  if (common.committeeId) {
    const seat = await prisma.projectOrgCommitteeMember.findFirst({
      where: {
        orgUserId: auth.orgUser.id,
        committeeId: common.committeeId,
        status: "ACTIVE",
      },
      select: { committeeRole: true },
    });
    common.committeeRole = seat?.committeeRole || null;
  }

  let result;
  if (taskMeta?.instance?.procurementId) {
    result = await actOnProcurementTask(prisma, {
      ...common,
      body: body && typeof body === "object" ? body : {},
    });
  } else if (taskMeta?.instance?.budgetId) {
    result = await actOnBudgetTask(prisma, common);
  } else if (taskMeta?.instance?.procurementPlanId) {
    result = await actOnProcurementPlanTask(prisma, common);
  } else {
    result = await actOnRequisitionTask(prisma, {
      ...common,
      procurementMethod:
        typeof body?.procurementMethod === "string"
          ? body.procurementMethod
          : null,
      form5: body?.form5 && typeof body.form5 === "object" ? body.form5 : null,
    });
  }

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        fieldErrors: result.fieldErrors,
        funding: result.funding,
      },
      { status: result.status || 400 },
    );
  }

  return NextResponse.json({ ok: true, ...result });
}
