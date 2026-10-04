import { NextResponse } from "next/server";
import { OrgBudgetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import {
  addBudgetLines,
  budgetInclude,
  deleteDraftBudget,
  getBudgetWorkflowStage,
  serializeBudget,
  setBudgetStatus,
  submitBudget,
  updateDraftBudget,
} from "@/lib/projects/budgets";
import {
  WORKFLOW_HISTORY_ACTION_SELECT,
  loadPrintOrganisation,
  mapWorkflowHistoryActions,
  printedByFromAuth,
} from "@/lib/projects/print-context";

export const runtime = "nodejs";

function canPrepareBudget(roleName) {
  return roleName === "User Department Officer" || roleName === "User Department";
}

export async function GET(_request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const budgetId = String(params?.budgetId || "").trim();
  if (!projectId || !budgetId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_BUDGETS,
  });
  const adminAuth = auth.ok
    ? null
    : await authorizeProjectApiAccess(prisma, {
        projectId,
        requireOrgAdmin: true,
      });
  if (!auth.ok && !adminAuth?.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }

  const row = await prisma.projectOrgBudget.findFirst({
    where: { id: budgetId, projectId },
    include: budgetInclude,
  });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (auth.ok && auth.type === "org") {
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
  }

  const history = await prisma.auditLog.findMany({
    where: {
      eventType: {
        in: [
          "PROJECT_ORG_BUDGET_CREATED",
          "PROJECT_ORG_BUDGET_UPDATED",
          "PROJECT_ORG_BUDGET_DELETED",
          "PROJECT_ORG_BUDGET_STATUS_CHANGED",
          "PROJECT_ORG_BUDGET_LINES_ADDED",
          "PROJECT_ORG_BUDGET_SUBMITTED",
          "PROJECT_ORG_WORKFLOW_TASK_COMPLETED",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const audit = history.filter((a) => JSON.stringify(a.meta || {}).includes(budgetId));

  /** @type {any} */
  let pendingTask = null;
  /** @type {any[]} */
  let workflowHistory = [];
  let canSubmit = false;
  let canEditDraft = false;
  let canDeleteDraft = false;

  const workflowStage = await getBudgetWorkflowStage(prisma, { projectId, budgetId });
  let lastDecision = null;
  let viewerHasPendingAction = false;

  const [organisation, instance] = await Promise.all([
    loadPrintOrganisation(prisma, projectId),
    prisma.projectOrgWorkflowInstance.findFirst({
      where: {
        projectId,
        budgetId,
        status: { in: ["ACTIVE", "IN_PROGRESS", "SUSPENDED", "COMPLETED", "CANCELLED"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        actions: {
          orderBy: { createdAt: "asc" },
          select: WORKFLOW_HISTORY_ACTION_SELECT,
        },
      },
    }),
  ]);
  workflowHistory = mapWorkflowHistoryActions(instance?.actions);
  const latestAction = workflowHistory.length ? workflowHistory[workflowHistory.length - 1] : null;
  if (latestAction) {
    lastDecision = {
      decision: latestAction.decision,
      actorRoleName: latestAction.actorRoleName || null,
    };
  }

  const printedBy = printedByFromAuth(auth.ok ? auth : adminAuth);

  if (auth.ok && auth.type === "org") {
    try {
      const { healMissingStepTasks } = await import("@/lib/projects/workflow-engine");
      await healMissingStepTasks(prisma, projectId, budgetId);
    } catch {
      // Non-fatal
    }

    const orgUserId = auth.orgUser.id;
    const role = auth.orgUser.projectOrgRole?.name || "";
    const isCreator =
      !row.createdByOrgUserId || row.createdByOrgUserId === orgUserId;
    canSubmit =
      canPrepareBudget(role) &&
      (row.status === "DRAFT" || row.status === "RETURNED") &&
      isCreator;
    canEditDraft =
      canPrepareBudget(role) &&
      (row.status === "DRAFT" || row.status === "RETURNED") &&
      isCreator;
    canDeleteDraft = canPrepareBudget(role) && row.status === "DRAFT" && isCreator;

    const task = await prisma.projectOrgWorkflowTask.findFirst({
      where: {
        projectId,
        assigneeOrgUserId: orgUserId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        instance: { budgetId },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        requiredRoleName: true,
        status: true,
        stepNumber: true,
      },
    });
    pendingTask = task;
    viewerHasPendingAction = Boolean(task);
  }

  return NextResponse.json({
    budget: serializeBudget({
      ...row,
      workflowStage,
      lastDecision,
      viewerHasPendingAction,
    }),
    pendingTask,
    workflowStage,
    workflowHistory,
    organisation,
    printedBy,
    canSubmit,
    canEditDraft,
    canDeleteDraft,
    audit: audit.map((a) => ({
      id: a.id,
      eventType: a.eventType,
      meta: a.meta,
      createdAt: a.createdAt,
      actorUserId: a.actorUserId,
    })),
  });
}

export async function PATCH(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const budgetId = String(params?.budgetId || "").trim();
  if (!projectId || !budgetId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Operational submit
  if (body?.action === "submit") {
    const auth = await authorizeProjectApiAccess(prisma, {
      projectId,
      orgPermission: ORG_PERMISSION.CREATE_BUDGET,
    });
    if (!auth.ok || auth.type !== "org") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const result = await submitBudget(prisma, {
      projectId,
      budgetId,
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

  if (body?.action === "updateDraft") {
    const auth = await authorizeProjectApiAccess(prisma, {
      projectId,
      orgPermission: ORG_PERMISSION.CREATE_BUDGET,
    });
    if (!auth.ok || auth.type !== "org") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const roleName = auth.orgUser.projectOrgRole?.name || "";
    if (!canPrepareBudget(roleName)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const result = await updateDraftBudget(prisma, {
      projectId,
      budgetId,
      actorOrgUserId: auth.orgUser.id,
      body,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, fieldErrors: result.fieldErrors },
        { status: result.status || 400 },
      );
    }
    return NextResponse.json(result);
  }

  // Creator may add lines to draft/returned
  if (body?.action === "addLines") {
    const auth = await authorizeProjectApiAccess(prisma, {
      projectId,
      orgPermission: ORG_PERMISSION.CREATE_BUDGET,
    });
    if (!auth.ok || auth.type !== "org") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const result = await addBudgetLines(prisma, {
      projectId,
      budgetId,
      actorUserId: null,
      lines: Array.isArray(body.lines) ? body.lines : [],
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }
    return NextResponse.json(result);
  }

  // Organization Administrator may only CLOSE (system housekeeping) — not APPROVE.
  if (body?.action === "setStatus") {
    const status = String(body.status || "").trim();
    if (status === OrgBudgetStatus.APPROVED) {
      return NextResponse.json(
        {
          error:
            "Budgets are approved through the budgeting workflow by operational roles, not by the Organization Administrator.",
          code: "ADMIN_CANNOT_APPROVE_BUDGET",
        },
        { status: 403 },
      );
    }
    if (status !== OrgBudgetStatus.CLOSED) {
      return NextResponse.json(
        {
          error:
            "Direct budget status changes are limited to closing. Use the budgeting workflow for approvals.",
        },
        { status: 403 },
      );
    }

    const adminAuth = await authorizeProjectApiAccess(prisma, {
      projectId,
      requireOrgAdmin: true,
    });
    if (!adminAuth.ok) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const result = await setBudgetStatus(prisma, {
      projectId,
      budgetId,
      actorUserId: adminAuth.user?.id || null,
      status: OrgBudgetStatus.CLOSED,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}

export async function DELETE(_request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const budgetId = String(params?.budgetId || "").trim();
  if (!projectId || !budgetId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.CREATE_BUDGET,
  });
  if (!auth.ok || auth.type !== "org") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const roleName = auth.orgUser.projectOrgRole?.name || "";
  if (!canPrepareBudget(roleName)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const result = await deleteDraftBudget(prisma, {
    projectId,
    budgetId,
    actorOrgUserId: auth.orgUser.id,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  }
  return NextResponse.json({ ok: true });
}
