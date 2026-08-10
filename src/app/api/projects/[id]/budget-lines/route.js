import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { Role } from "@prisma/client";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import { listSelectableBudgetLines } from "@/lib/projects/budgets";

export const runtime = "nodejs";

/**
 * Selectable approved budget lines for requisitions / plans.
 * Prefer GET /budgets?selectable=1; kept for backward compatibility.
 */
export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const financialYearId = searchParams.get("financialYearId") || "";
  const departmentId = searchParams.get("departmentId") || "";

  let allowed = false;
  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_BUDGETS,
  });
  if (auth.ok) allowed = true;
  if (!allowed) {
    const alt = await authorizeProjectApiAccess(prisma, {
      projectId,
      orgPermission: ORG_PERMISSION.CREATE_REQUISITION,
    });
    if (alt.ok) allowed = true;
  }
  if (!allowed) {
    const alt2 = await authorizeProjectApiAccess(prisma, {
      projectId,
      orgPermission: ORG_PERMISSION.VIEW_PROCUREMENT_PLANS,
    });
    if (alt2.ok) allowed = true;
  }
  if (!allowed) {
    const user = await getSessionUser();
    if (user) {
      const admin = await authorizeProjectOrgAdmin(prisma, {
        projectId,
        userId: user.id,
        activeRole: sessionActiveRole(user) || Role.STUDENT,
      });
      if (admin.ok) allowed = true;
    }
  }
  if (!allowed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const budgetLines = await listSelectableBudgetLines(prisma, {
    projectId,
    financialYearId: financialYearId || null,
    departmentId: departmentId || null,
  });

  return NextResponse.json({ budgetLines });
}

/** @deprecated Prefer POST /api/projects/[id]/budgets */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Create budgets via Budget Management (POST /api/projects/{id}/budgets). Standalone budget-line create is disabled.",
    },
    { status: 410 },
  );
}
