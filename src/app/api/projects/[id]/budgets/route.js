import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import { isDepartmentScopedRole } from "@/lib/projects/workflow-engine";
import {
  budgetInclude,
  createBudgetWithLines,
  listSelectableBudgetLines,
  mapBudgetWorkflowStages,
  serializeBudget,
  submitBudget,
} from "@/lib/projects/budgets";
import {
  orgOpsSlateListWhere,
  resolveCurrentOrgSlateId,
} from "@/lib/academic/org-academic-slate";

export const runtime = "nodejs";

function canPrepareBudget(roleName) {
  return (
    roleName === "User Department Officer" ||
    roleName === "User Department"
  );
}

export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const selectableOnly = searchParams.get("selectable") === "1";
  const financialYearId = searchParams.get("financialYearId") || "";
  const departmentId = searchParams.get("departmentId") || "";

  if (selectableOnly) {
    const auth = await authorizeProjectApiAccess(prisma, {
      projectId,
      orgPermission: ORG_PERMISSION.VIEW_BUDGETS,
    });
    const alt = auth.ok
      ? auth
      : await authorizeProjectApiAccess(prisma, {
          projectId,
          orgPermission: ORG_PERMISSION.CREATE_REQUISITION,
        });
    const planAuth = alt.ok
      ? alt
      : await authorizeProjectApiAccess(prisma, {
          projectId,
          orgPermission: ORG_PERMISSION.VIEW_PROCUREMENT_PLANS,
        });
    if (!planAuth.ok) {
      return NextResponse.json(
        { error: planAuth.status === 403 ? "Forbidden." : "Not found." },
        { status: planAuth.status },
      );
    }

    const orgUser = planAuth.type === "org" ? planAuth.orgUser : null;
    const ownDepartmentOnly =
      orgUser?.departmentId && isDepartmentScopedRole(orgUser.projectOrgRole?.name);
    const lines = await listSelectableBudgetLines(prisma, {
      projectId,
      financialYearId: financialYearId || null,
      departmentId: ownDepartmentOnly
        ? orgUser.departmentId
        : departmentId || orgUser?.departmentId || null,
    });
    return NextResponse.json({ budgetLines: lines });
  }

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_BUDGETS,
  });
  if (!auth.ok) {
    // Platform Organization Administrator may view (config) but not create operational budgets
    const adminAuth = await authorizeProjectApiAccess(prisma, {
      projectId,
      requireOrgAdmin: true,
    });
    if (!adminAuth.ok) {
      return NextResponse.json(
        { error: auth.status === 403 ? "Forbidden." : "Not found." },
        { status: auth.status },
      );
    }
  }

  /** @type {any} */
  const where = { projectId };
  if (auth.ok && auth.type === "org") {
    const role = auth.orgUser.projectOrgRole?.name || "";
    if (
      role === "User Department Officer" ||
      role === "User Department" ||
      role === "Head User Department" ||
      role === "Head of User Department"
    ) {
      if (auth.orgUser.departmentId) {
        where.departmentId = auth.orgUser.departmentId;
      }
    }
  }
  Object.assign(where, orgOpsSlateListWhere(await resolveCurrentOrgSlateId(prisma, projectId)));

  const budgets = await prisma.projectOrgBudget.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    include: budgetInclude,
  });

  const stageMap = await mapBudgetWorkflowStages(prisma, {
    projectId,
    budgetIds: budgets.map((b) => b.id),
    viewerOrgUserId: auth.ok && auth.type === "org" ? auth.orgUser.id : null,
  });

  const roleName =
    auth.ok && auth.type === "org" ? auth.orgUser.projectOrgRole?.name || "" : "";

  let actorDepartment = null;
  if (auth.ok && auth.type === "org" && auth.orgUser.departmentId) {
    const dept = await prisma.projectOrgDepartment.findFirst({
      where: { id: auth.orgUser.departmentId, projectId },
      select: { id: true, name: true, code: true },
    });
    actorDepartment = dept;
  }

  const projectMeta = await prisma.project.findUnique({
    where: { id: projectId },
    select: { projectCode: true },
  });

  return NextResponse.json({
    budgets: budgets.map((row) => {
      const ctx = stageMap.get(row.id) || {};
      return serializeBudget({
        ...row,
        workflowStage: ctx.workflowStage || null,
        lastDecision: ctx.lastDecision || null,
        viewerHasPendingAction: Boolean(ctx.viewerHasPendingAction),
      });
    }),
    total: budgets.length,
    canCreate: auth.ok && auth.type === "org" && canPrepareBudget(roleName),
    canSubmit: auth.ok && auth.type === "org" && canPrepareBudget(roleName),
    actorDepartment,
    orgCode: projectMeta?.projectCode || null,
  });
}

export async function POST(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.CREATE_BUDGET,
  });
  if (!auth.ok || auth.type !== "org") {
    return NextResponse.json(
      {
        error:
          "Only operational department users can create budgets. The Organization Administrator configures the system but does not prepare budgets.",
      },
      { status: 403 },
    );
  }

  const roleName = auth.orgUser.projectOrgRole?.name || "";
  if (!canPrepareBudget(roleName)) {
    return NextResponse.json(
      { error: "Only User Department Officers can prepare department budgets." },
      { status: 403 },
    );
  }
  if (!auth.orgUser.departmentId) {
    return NextResponse.json(
      { error: "Your account must belong to a department." },
      { status: 400 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body?.action === "submit") {
    const budgetId = typeof body.budgetId === "string" ? body.budgetId.trim() : "";
    if (!budgetId) {
      return NextResponse.json({ error: "Budget id is required." }, { status: 400 });
    }
    const submitted = await submitBudget(prisma, {
      projectId,
      budgetId,
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

  const result = await createBudgetWithLines(prisma, {
    projectId,
    actorOrgUserId: auth.orgUser.id,
    body: {
      ...body,
      departmentId: auth.orgUser.departmentId,
    },
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, fieldErrors: result.fieldErrors },
      { status: 400 },
    );
  }
  return NextResponse.json(result, { status: 201 });
}
