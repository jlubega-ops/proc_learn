import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import {
  requisitionInclude,
  serializeRequisition,
  submitRequisition,
  getRequesterRequisitionMutationFlags,
  createOrUpdateRequisitionDraft,
  deleteRequisitionByRequester,
  buildRequisitionVerificationEvidence,
  requisitionViewScopeWhere,
} from "@/lib/projects/requisitions";
import { healMissingStepTasks } from "@/lib/projects/workflow-engine";
import { fetchForm5OrgDefaults } from "@/lib/projects/form5-prefill";
import {
  checkActingModeForTask,
  getActiveCommittee,
} from "@/lib/projects/committee-context";
import {
  WORKFLOW_HISTORY_ACTION_SELECT,
  attachCommitteeNames,
  loadPrintOrganisation,
  mapWorkflowHistoryActions,
  printedByFromAuth,
} from "@/lib/projects/print-context";

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
          actions: {
            orderBy: { createdAt: "asc" },
            select: WORKFLOW_HISTORY_ACTION_SELECT,
          },
          tasks: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (auth.type === "org") {
    const scope = requisitionViewScopeWhere(auth.orgUser);
    const inScope = Object.entries(scope).every(
      ([key, value]) => row[key] === value,
    );
    if (
      !inScope &&
      !(await prisma.projectOrgWorkflowTask.findFirst({
        where: {
          projectId,
          assigneeOrgUserId: auth.orgUser.id,
          instance: { requisitionId },
        },
        select: { id: true },
      }))
    ) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  /** @type {any} */
  let pendingTask = null;
  /** @type {any} */
  let workflowStage = null;
  /** @type {any} */
  let lastDecision = null;
  let viewerHasPendingAction = false;
  /** @type {{ title: string; message: string } | null} */
  let blockedTask = null;

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
    if (pendingTask) {
      const mode = checkActingModeForTask(
        pendingTask,
        await getActiveCommittee(prisma, auth.orgUser.id),
      );
      if (!mode.ok) {
        blockedTask = { title: pendingTask.title, message: mode.error };
        pendingTask = null;
      }
    }
    viewerHasPendingAction = Boolean(pendingTask);
  }

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
      title: openTask.title,
      requiredRoleName: openTask.requiredRoleName || null,
      stepNumber: openTask.stepNumber,
      status: openTask.status,
    };
  }

  const history = await attachCommitteeNames(
    prisma,
    [...(row.instances || [])]
      .reverse()
      .flatMap((inst) => mapWorkflowHistoryActions(inst.actions)),
  );
  if (history.length) {
    const latest = history[history.length - 1];
    lastDecision = {
      decision: latest.decision,
      actorRoleName: latest.actorRoleName || null,
    };
  }

  const organisation = await loadPrintOrganisation(prisma, projectId);

  const form5Defaults = await fetchForm5OrgDefaults(prisma, projectId, {
    departmentId: row.departmentId,
    requester: row.requester,
  });

  let canEdit = false;
  let canDelete = false;
  if (auth.type === "org") {
    const flags = await getRequesterRequisitionMutationFlags(prisma, {
      projectId,
      requisition: row,
      actorOrgUserId: auth.orgUser.id,
    });
    canEdit = flags.canEdit;
    canDelete = flags.canDelete;
  }

  const evidence = await buildRequisitionVerificationEvidence(prisma, row);
  const planEvidence = /** @type {any} */ (evidence?.plan) || null;
  const planCheck = planEvidence
    ? {
        plannedQuantity: planEvidence.plannedQuantity,
        plannedAmount: planEvidence.plannedAmount,
        otherConsumedQuantity: planEvidence.otherConsumedQuantity,
        otherConsumedValue: planEvidence.otherConsumedValue,
        requisitionQuantity: planEvidence.requisitionQuantity,
        requisitionAmount: planEvidence.requisitionAmount,
        remainingQuantity: planEvidence.remainingQuantity,
        remainingPlannedValue: planEvidence.remainingPlannedValue,
      }
    : null;

  return NextResponse.json({
    requisition: {
      ...serializeRequisition({
        ...row,
        workflowStage,
        lastDecision,
        viewerHasPendingAction,
      }),
      planCheck,
    },
    form5Defaults,
    pendingTask: pendingTask
      ? {
          ...pendingTask,
          actionKey: pendingTask.processFlowItem?.actionKey || null,
        }
      : null,
    blockedTask,
    canEdit,
    canDelete,
    history,
    organisation,
    printedBy: printedByFromAuth(auth),
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
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.CREATE_REQUISITION,
  });
  if (!auth.ok || auth.type !== "org") {
    return NextResponse.json(
      { error: auth.ok ? "Forbidden." : "Not found." },
      { status: auth.ok ? 403 : auth.status || 404 },
    );
  }

  if (body?.action !== "submit") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  const submitted = await submitRequisition(prisma, {
    requisitionId,
    projectId,
    actorOrgUserId: auth.orgUser.id,
    actorRoleName:
      auth.orgUser.projectOrgRole?.name || "User Department Officer",
  });
  if (!submitted.ok) {
    return NextResponse.json(
      { error: submitted.error, code: submitted.code },
      { status: submitted.status || 400 },
    );
  }
  return NextResponse.json(submitted);
}

export async function PATCH(request, context) {
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
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.CREATE_REQUISITION,
  });
  if (!auth.ok || auth.type !== "org") {
    return NextResponse.json(
      { error: auth.ok ? "Forbidden." : "Not found." },
      { status: auth.ok ? 403 : auth.status || 404 },
    );
  }

  if (body?.action === "update") {
    const updated = await createOrUpdateRequisitionDraft(prisma, {
      projectId,
      requisitionId,
      requesterOrgUserId: auth.orgUser.id,
      actorDepartmentId: auth.orgUser.departmentId,
      departmentId: auth.orgUser.departmentId,
      body,
    });
    if (!updated.ok) {
      return NextResponse.json(
        { error: updated.error, fieldErrors: updated.fieldErrors },
        { status: updated.status || 400 },
      );
    }
    return NextResponse.json(updated);
  }

  if (body?.action === "delete") {
    const deleted = await deleteRequisitionByRequester(prisma, {
      projectId,
      requisitionId,
      actorOrgUserId: auth.orgUser.id,
      actorRoleName: auth.orgUser.projectOrgRole?.name || null,
    });
    if (!deleted.ok) {
      return NextResponse.json(
        { error: deleted.error },
        { status: deleted.status || 400 },
      );
    }
    return NextResponse.json(deleted);
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
