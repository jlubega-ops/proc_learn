import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import { serializeProcurement } from "@/lib/projects/procurements";
import {
  filterDomainTimeline,
  procurementIncludeForSections,
  procurementStageSummaries,
  redactHiddenSections,
  sectionsWithData,
} from "@/lib/projects/procurement-section-data";
import { loadProcurementDomainTimeline } from "@/lib/projects/procurement-timeline";
import { evaluateClosureReadiness } from "@/lib/projects/procurement-closure";
import { healMissingStepTasks } from "@/lib/projects/workflow-engine";
import {
  checkActingModeForTask,
  getActiveCommittee,
  requireCommitteeMembership,
} from "@/lib/projects/committee-context";
import { loadProcurementWorkflowProgress } from "@/lib/projects/procurement-workflow-progress";
import { procurementSectionAccess } from "@/lib/projects/procurement-section-access";
import { presentProcurementStatus } from "@/lib/projects/workflow-status-presentation";
import {
  decideRecommendation,
  findHeldProcurementTask,
  loadRecommendations,
  recommendationStage,
  submitRecommendation,
} from "@/lib/projects/procurement-recommendations";
import { isRecommendationDecisionTask } from "@/lib/projects/procurement-recommendation-options";
import { loadPurchaseInstructionDoc } from "@/lib/projects/purchase-instructions";
import { loadPrintOrganisation, printedByFromAuth } from "@/lib/projects/print-context";
import { isReceiveGoodsStep } from "@/lib/projects/procurement-task-stage";

export const runtime = "nodejs";

export async function GET(_request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const procurementId = String(params?.procurementId || "").trim();
  if (!projectId || !procurementId) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_PROCUREMENTS,
  });
  if (!auth.ok) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  /** @type {[unknown, any]} */
  const [, activeCommittee] = await Promise.all([
    healMissingStepTasks(prisma, projectId).catch(() => null),
    auth.type === "org" ? getActiveCommittee(prisma, auth.orgUser.id) : Promise.resolve(null),
  ]);
  const sections =
    auth.type === "org"
      ? procurementSectionAccess({
          roleName: auth.orgUser.projectOrgRole?.name || null,
          committeeType: activeCommittee?.committeeType || null,
        })
      : null;
  const keep = sectionsWithData(sections);

  const fullRow = await prisma.projectOrgProcurement.findFirst({
    where: { id: procurementId, projectId },
    include: procurementIncludeForSections(keep),
  });
  if (!fullRow) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (auth.type === "org") {
    const role = auth.orgUser.projectOrgRole?.name || "";
    if (
      (role === "User Department Officer" ||
        role === "User Department" ||
        role === "Head User Department" ||
        role === "Head of User Department") &&
      auth.orgUser.departmentId &&
      fullRow.departmentId !== auth.orgUser.departmentId
    ) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  const stageSummaries = procurementStageSummaries(fullRow, sections);
  const row = redactHiddenSections(fullRow, keep);

  /** @type {any} */
  let pendingTask = null;
  /** @type {{ title: string; message: string } | null} */
  let blockedTask = null;
  if (auth.type === "org") {
    pendingTask = await prisma.projectOrgWorkflowTask.findFirst({
      where: {
        projectId,
        assigneeOrgUserId: auth.orgUser.id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        instance: { procurementId },
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
      const mode = checkActingModeForTask(pendingTask, activeCommittee);
      if (!mode.ok) {
        blockedTask = { title: pendingTask.title, message: mode.error };
        pendingTask = null;
      }
    }
  }

  const workflowProgress = await loadProcurementWorkflowProgress(prisma, projectId, procurementId);

  const domainTimeline = filterDomainTimeline(
    await loadProcurementDomainTimeline(prisma, {
      projectId,
      procurementId,
      procurementNumber: row.procurementNumber,
    }),
    sections,
  );

  const [recommendations, stage] = await Promise.all([
    loadRecommendations(prisma, { projectId, procurementId }),
    recommendationStage(prisma, { projectId, procurementId }),
  ]);
  const pendingRecommendation = recommendations.find((r) => r.status === "PENDING") || null;
  const heldTask =
    auth.type === "org"
      ? await findHeldProcurementTask(prisma, {
          projectId,
          procurementId,
          orgUserId: auth.orgUser.id,
        })
      : null;
  const canDecide = Boolean(
    pendingRecommendation && pendingTask && isRecommendationDecisionTask(pendingTask.title),
  );
  const decisionBlocked = Boolean(
    pendingRecommendation && blockedTask && isRecommendationDecisionTask(blockedTask.title),
  );

  const stepHead = String(workflowProgress?.currentStep?.label || "").split(":")[0].trim();
  const awaitingDelivery =
    !pendingRecommendation && isReceiveGoodsStep(stepHead)
      ? (await prisma.projectOrgDeliveryNote.count({ where: { procurementId, status: "SUBMITTED" } })) === 0
      : false;

  const presented = presentProcurementStatus({
    status: row.status,
    progress: pendingRecommendation
      ? {
          status: "ACTIVE",
          currentStep: { label: "Decide PDU recommendation", roleName: "Contracts Committee" },
          waitingOnRole: "Contracts Committee",
        }
      : workflowProgress,
    viewerHasPendingAction: pendingRecommendation ? canDecide : Boolean(pendingTask),
    viewerTaskInOtherMode: pendingRecommendation ? decisionBlocked : Boolean(blockedTask),
    awaitingProviderOn: pendingRecommendation
      ? null
      : row.purchaseInstructions?.[0]?.status === "ISSUED"
        ? "purchase instruction"
        : row.lpos?.[0]?.status === "ISSUED"
          ? "LPO"
          : null,
    awaitingDelivery,
  });
  const procurement = {
    ...serializeProcurement(row, { domainTimeline }),
    statusLabel: presented.label,
    statusColor: presented.color,
    stageLabel: presented.stageLabel,
  };

  let closure = null;
  try {
    const readiness = await evaluateClosureReadiness(prisma, projectId, procurementId);
    closure = {
      ready: Boolean(readiness.ok),
      blockers: readiness.blockers || [],
    };
  } catch {
    closure = { ready: false, blockers: ["Could not evaluate closure readiness."] };
  }

  const [purchaseInstructionDoc, organisation] = await Promise.all([
    keep.has("contract") && row.purchaseInstructions?.length
      ? loadPurchaseInstructionDoc(prisma, { projectId, procurementId })
      : Promise.resolve(null),
    loadPrintOrganisation(prisma, projectId),
  ]);

  return NextResponse.json({
    procurement,
    purchaseInstructionDoc,
    organisation,
    printedBy: printedByFromAuth(auth),
    pendingTask: pendingTask
      ? {
          ...pendingTask,
          actionKey: pendingTask.processFlowItem?.actionKey || null,
        }
      : null,
    blockedTask,
    workflowProgress,
    recommendations,
    recommendation: {
      allowed: stage.allowed,
      kinds: stage.kinds,
      currentProviderId: stage.currentProviderId,
      pending: pendingRecommendation,
      canRecommend: Boolean(heldTask) && stage.allowed && !pendingRecommendation,
      canDecide,
    },
    viewer:
      auth.type === "org"
        ? {
            roleName: auth.orgUser.projectOrgRole?.name || null,
            committeeType: activeCommittee?.committeeType || null,
            committeeName: activeCommittee?.name || null,
            sections,
          }
        : null,
    stageSummaries,
    closure,
  });
}

export async function POST(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const procurementId = String(params?.procurementId || "").trim();
  if (!projectId || !procurementId) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_PROCUREMENTS,
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

  const actorRoleName = auth.orgUser.projectOrgRole?.name || "";

  if (body?.action === "recommend") {
    const result = await submitRecommendation(prisma, {
      projectId,
      procurementId,
      actorOrgUserId: auth.orgUser.id,
      actorRoleName,
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

  if (body?.action === "decide_recommendation") {
    const activeCommittee = await getActiveCommittee(prisma, auth.orgUser.id);
    const mode = checkActingModeForTask({ requiredRoleName: "Contracts Committee" }, activeCommittee);
    if (!mode.ok) {
      return NextResponse.json({ error: mode.error, code: mode.code }, { status: mode.status || 403 });
    }
    const seat = await requireCommitteeMembership(prisma, {
      projectId,
      orgUserId: auth.orgUser.id,
      committeeId: activeCommittee?.id || null,
      committeeType: "CONTRACTS",
    });
    if (!seat.ok) {
      return NextResponse.json({ error: seat.error }, { status: seat.status || 403 });
    }
    const result = await decideRecommendation(prisma, {
      projectId,
      procurementId,
      recommendationId: typeof body.recommendationId === "string" ? body.recommendationId : "",
      decision: body.decision,
      comment: body.comment,
      actorOrgUserId: auth.orgUser.id,
      actorRoleName,
      committeeId: seat.committee?.id || null,
      committeeRole: seat.committeeRole || null,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, fieldErrors: result.fieldErrors },
        { status: result.status || 400 },
      );
    }
    return NextResponse.json(result);
  }

  if (body?.action !== "save_bid_document") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  const { saveBidDocumentForProcurement } = await import("@/lib/projects/solicitations");
  const saved = await saveBidDocumentForProcurement(prisma, {
    projectId,
    procurementId,
    actorOrgUserId: auth.orgUser.id,
    actorRoleName: auth.orgUser.projectOrgRole?.name || null,
    body: body.bidDocument || body,
    pdeName: body.pdeName || null,
  });
  if (!saved.ok) {
    return NextResponse.json(
      { error: saved.error, fieldErrors: saved.fieldErrors },
      { status: saved.status || 400 },
    );
  }
  return NextResponse.json(saved);
}
