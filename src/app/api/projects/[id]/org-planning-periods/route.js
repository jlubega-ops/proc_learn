import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { cachedRead } from "@/lib/server-cache";
import { cachedJson } from "@/lib/api/cached-json";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import {
  authorizeProjectApiAccess,
  authorizeProjectOrgRead,
} from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import {
  isFinancialYearCurrentlyValid,
  listActiveFinancialYearRows,
} from "@/lib/projects/org-financial-years";
import {
  planningPeriodSelect,
  resolveActiveProjectFinancialYear,
  serializeProjectOrgPlanningPeriod,
  computePlanningPeriodStatus,
} from "@/lib/projects/org-planning-periods";
import { validateProjectOrgPlanningPeriodInput } from "@/lib/validation/project-org-planning-period";
import { toDateInputValue } from "@/lib/financial-year-dates";

export const runtime = "nodejs";

const SELECTABLE_PERIOD_PERMISSIONS = [
  ORG_PERMISSION.VIEW_PLANNING_PERIODS,
  ORG_PERMISSION.VIEW_PROCUREMENT_PLANS,
  ORG_PERMISSION.CREATE_REQUISITION,
];

/**
 * @param {string} projectId
 */
async function authorizeSelectablePlanningPeriods(projectId) {
  for (const orgPermission of SELECTABLE_PERIOD_PERMISSIONS) {
    const auth = await authorizeProjectApiAccess(prisma, { projectId, orgPermission });
    if (auth.ok) return auth;
  }
  return authorizeProjectApiAccess(prisma, { projectId, requireOrgAdmin: true });
}

export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const selectableOnly = searchParams.get("selectable") === "1";
  const financialYearId = searchParams.get("financialYearId") || "";

  if (selectableOnly) {
    const auth = await authorizeSelectablePlanningPeriods(projectId);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.status === 403 ? "Forbidden." : "Not found." },
        { status: auth.status },
      );
    }

    /** @type {any} */
    const where = { projectId };
    if (financialYearId) where.financialYearId = financialYearId;

    const rows = await cachedRead(
      `org-planning-periods:${projectId}:selectable:${financialYearId}`,
      PERIOD_MODELS,
      () =>
        prisma.projectOrgPlanningPeriod.findMany({
          where,
          orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
          take: 50,
          select: planningPeriodSelect,
        }),
    );
    const now = new Date();
    const open = rows
      .map((row) => serializeProjectOrgPlanningPeriod(row, now))
      .filter((p) => p.status === "OPEN");

    return cachedJson(request, {
      planningPeriods: open,
      total: open.length,
      message:
        open.length > 0
          ? null
          : "No OPEN planning period is available. Ask the Organization Administrator to configure a planning period that covers today.",
    }, { revalidate: true });
  }

  const auth = await authorizeProjectOrgRead(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_PLANNING_PERIODS,
  });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }

  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSizeRaw = Number(searchParams.get("pageSize") || 10);
  const pageSize = Math.min(50, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10));
  const skip = (page - 1) * pageSize;

  const where = { projectId };

  const { total, rows, financialYearRows } = await cachedRead(
    `org-planning-periods:${projectId}:list:${page}:${pageSize}`,
    PERIOD_MODELS,
    async () => {
      const [total, rows, financialYearRows] = await Promise.all([
        prisma.projectOrgPlanningPeriod.count({ where }),
        prisma.projectOrgPlanningPeriod.findMany({
          where,
          orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
          skip,
          take: pageSize,
          select: planningPeriodSelect,
        }),
        listActiveFinancialYearRows(prisma, projectId),
      ]);
      return { total, rows, financialYearRows };
    },
  );

  const now = new Date();
  return cachedJson(request, {
    planningPeriods: rows.map((row) => serializeProjectOrgPlanningPeriod(row, now)),
    activeFinancialYears: financialYearRows
      .filter((row) => isFinancialYearCurrentlyValid(row.startDate, row.endDate, now))
      .map((row) => ({ id: row.id, label: row.label })),
    serverToday: toDateInputValue(now),
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }, { revalidate: true });
}

const PERIOD_MODELS = ["ProjectOrgPlanningPeriod", "ProjectOrgFinancialYear", "Project:delete"];

export async function POST(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProjectOrgAdmin(prisma, {
    projectId,
    userId: user.id,
    activeRole,
  });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validated = validateProjectOrgPlanningPeriodInput(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validated.errors },
      { status: 400 },
    );
  }

  const financialYear = await resolveActiveProjectFinancialYear(
    prisma,
    projectId,
    validated.data.financialYearId,
  );
  if (!financialYear) {
    return NextResponse.json(
      {
        error: "Selected financial year is not available.",
        fieldErrors: { financialYearId: "Choose an active financial year." },
      },
      { status: 400 },
    );
  }

  const now = new Date();
  const status = computePlanningPeriodStatus(
    validated.data.startDate,
    validated.data.endDate,
    now,
  );

  const row = await prisma.projectOrgPlanningPeriod.create({
    data: {
      projectId,
      financialYearId: financialYear.id,
      label: validated.data.label,
      startDate: validated.data.startDate,
      endDate: validated.data.endDate,
      status,
    },
    select: planningPeriodSelect,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PLANNING_PERIOD_CREATED,
    actorUserId: user.id,
    meta: {
      projectId,
      planningPeriodId: row.id,
      financialYearId: row.financialYearId,
      label: row.label,
      periodLabel: serializeProjectOrgPlanningPeriod(row, now).periodLabel,
      status,
    },
  });

  return NextResponse.json(
    { planningPeriod: serializeProjectOrgPlanningPeriod(row, now) },
    { status: 201 },
  );
}
