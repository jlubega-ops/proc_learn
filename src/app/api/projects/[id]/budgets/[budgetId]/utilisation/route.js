import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import { loadBudgetUtilisation } from "@/lib/projects/budget-utilisation";

export const runtime = "nodejs";

const DEPARTMENT_SCOPED_ROLES = new Set([
  "User Department Officer",
  "User Department",
  "Head User Department",
  "Head of User Department",
]);

export async function GET(request, context) {
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
    : await authorizeProjectApiAccess(prisma, { projectId, requireOrgAdmin: true });
  if (!auth.ok && !adminAuth?.ok) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const budget = await prisma.projectOrgBudget.findFirst({
    where: { id: budgetId, projectId },
    select: { id: true, departmentId: true },
  });
  if (!budget) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (auth.ok && auth.type === "org") {
    const role = auth.orgUser.projectOrgRole?.name || "";
    if (
      DEPARTMENT_SCOPED_ROLES.has(role) &&
      auth.orgUser.departmentId &&
      budget.departmentId &&
      budget.departmentId !== auth.orgUser.departmentId
    ) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  const sp = new URL(request.url).searchParams;
  const page = Math.max(1, Number.parseInt(sp.get("page") || "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(sp.get("pageSize") || "10", 10) || 10));
  const lineId = String(sp.get("lineId") || "").trim() || null;

  const data = await loadBudgetUtilisation(prisma, { projectId, budgetId, page, pageSize, lineId });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
