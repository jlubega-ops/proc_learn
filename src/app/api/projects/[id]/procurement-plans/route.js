import { NextResponse } from "next/server";
import { OrgProcurementPlanStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import { isDepartmentScopedRole } from "@/lib/projects/workflow-engine";
import {
  createOrUpdateProcurementPlanDraft,
  getCreatorProcurementPlanMutationFlags,
  procurementPlanInclude,
  serializeProcurementPlan,
  submitProcurementPlan,
} from "@/lib/projects/procurement-plans";
import {
  orgOpsSlateListWhere,
  resolveCurrentOrgSlateId,
} from "@/lib/academic/org-academic-slate";
import { mapEntityWorkflowContexts } from "@/lib/projects/workflow-status-presentation";

export const runtime = "nodejs";

export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId)
    return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

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

  const { searchParams } = new URL(request.url);
  const approvedOnly = searchParams.get("approved") === "1";
  const mine = searchParams.get("mine") === "1";

  /** @type {any} */
  const where = { projectId };
  if (approvedOnly) where.status = OrgProcurementPlanStatus.APPROVED;
  if (auth.type === "org" && mine) {
    where.createdByOrgUserId = auth.orgUser.id;
  }
  if (
    auth.type === "org" &&
    auth.orgUser.departmentId &&
    (mine ||
      approvedOnly ||
      isDepartmentScopedRole(auth.orgUser.projectOrgRole?.name))
  ) {
    where.departmentId = auth.orgUser.departmentId;
  }
  Object.assign(
    where,
    orgOpsSlateListWhere(await resolveCurrentOrgSlateId(prisma, projectId)),
  );

  const plans = await prisma.projectOrgProcurementPlan.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    include: procurementPlanInclude,
  });

  const ctxMap = await mapEntityWorkflowContexts(prisma, {
    projectId,
    entityField: "procurementPlanId",
    entityIds: plans.map((p) => p.id),
    viewerOrgUserId: auth.type === "org" ? auth.orgUser.id : null,
  });

  let actorDepartment = null;
  if (auth.type === "org" && auth.orgUser?.departmentId) {
    const dept = await prisma.projectOrgDepartment.findFirst({
      where: { id: auth.orgUser.departmentId, projectId },
      select: { id: true, name: true, code: true },
    });
    actorDepartment = dept;
  }

  let hasApprovedBudget = false;
  if (auth.type === "org" && auth.orgUser?.departmentId) {
    const { OrgBudgetStatus } = await import("@prisma/client");
    const approved = await prisma.projectOrgBudget.count({
      where: {
        projectId,
        departmentId: auth.orgUser.departmentId,
        status: OrgBudgetStatus.APPROVED,
      },
    });
    hasApprovedBudget = approved > 0;
  }

  const projectMeta = await prisma.project.findUnique({
    where: { id: projectId },
    select: { projectCode: true },
  });

  const actorOrgUserId = auth.type === "org" ? auth.orgUser.id : null;
  const plansOut = await Promise.all(
    plans.map(async (row) => {
      const ctx = ctxMap.get(row.id) || {};
      const serialized = serializeProcurementPlan({
        ...row,
        workflowStage: ctx.workflowStage || null,
        lastDecision: ctx.lastDecision || null,
        viewerHasPendingAction: Boolean(ctx.viewerHasPendingAction),
      });
      if (!actorOrgUserId) {
        return { ...serialized, canEdit: false, canDelete: false, awaitingHodReview: false };
      }
      const flags = await getCreatorProcurementPlanMutationFlags(prisma, {
        projectId,
        plan: row,
        actorOrgUserId,
      });
      return { ...serialized, ...flags };
    }),
  );

  return NextResponse.json({
    plans: plansOut,
    total: plans.length,
    canCreate: auth.type === "org" && Boolean(auth.orgUser?.departmentId),
    hasApprovedBudget,
    actorDepartment,
    orgCode: projectMeta?.projectCode || null,
  });
}

export async function POST(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId)
    return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  if (body.action === "consolidate") {
    const { consolidateDepartmentPlans } =
      await import("@/lib/projects/procurement-plans");
    if (roleName !== "Head PDU") {
      return NextResponse.json(
        { error: "Only the Head PDU can consolidate departmental plans." },
        { status: 403 },
      );
    }
    const result = await consolidateDepartmentPlans(prisma, {
      projectId,
      actorOrgUserId: auth.orgUser.id,
      actorRoleName: roleName,
      financialYearId:
        typeof body.financialYearId === "string"
          ? body.financialYearId.trim()
          : "",
      planningPeriodId:
        typeof body.planningPeriodId === "string"
          ? body.planningPeriodId.trim() || null
          : null,
      title: typeof body.title === "string" ? body.title : undefined,
      sourcePlanIds: Array.isArray(body.sourcePlanIds)
        ? body.sourcePlanIds
            .filter((x) => typeof x === "string" && x.trim())
            .map((x) => x.trim())
        : [],
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status || 400 },
      );
    }
    return NextResponse.json(result, { status: 201 });
  }

  const canPrepare =
    roleName === "User Department Officer" || roleName === "User Department";
  if (!canPrepare) {
    return NextResponse.json(
      { error: "Only User Department Officers can create procurement plans." },
      { status: 403 },
    );
  }
  if (!auth.orgUser.departmentId) {
    return NextResponse.json(
      { error: "Your account must belong to a department." },
      { status: 400 },
    );
  }

  if (body.action === "submit") {
    const planId = typeof body.planId === "string" ? body.planId.trim() : "";
    if (!planId)
      return NextResponse.json(
        { error: "Plan id is required." },
        { status: 400 },
      );
    const submitted = await submitProcurementPlan(prisma, {
      projectId,
      planId,
      actorOrgUserId: auth.orgUser.id,
      actorRoleName: roleName,
      actorDepartmentId: auth.orgUser.departmentId,
    });
    if (!submitted.ok) {
      return NextResponse.json(
        { error: submitted.error, code: submitted.code },
        { status: submitted.status || 400 },
      );
    }
    return NextResponse.json(submitted);
  }

  const result = await createOrUpdateProcurementPlanDraft(prisma, {
    projectId,
    actorOrgUserId: auth.orgUser.id,
    departmentId: auth.orgUser.departmentId,
    body,
    planId: typeof body?.planId === "string" ? body.planId.trim() : null,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, fieldErrors: result.fieldErrors },
      { status: result.status || 400 },
    );
  }
  return NextResponse.json(result, { status: 201 });
}
