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
  deactivateOtherProjectFinancialYears,
  financialYearOverlapResponse,
  financialYearSelect,
  findOverlappingFinancialYear,
  listActiveFinancialYearRows,
  selectableFinancialYearsFromRows,
  serializeProjectOrgFinancialYear,
} from "@/lib/projects/org-financial-years";
import { validateProjectOrgFinancialYearInput } from "@/lib/validation/project-org-financial-year";
import { toDateInputValue } from "@/lib/financial-year-dates";

export const runtime = "nodejs";

/** Permissions that may load active, date-valid FYs for operational forms. */
const SELECTABLE_FY_PERMISSIONS = [
  ORG_PERMISSION.VIEW_FINANCIAL_YEARS,
  ORG_PERMISSION.VIEW_BUDGETS,
  ORG_PERMISSION.CREATE_BUDGET,
  ORG_PERMISSION.VIEW_PROCUREMENT_PLANS,
  ORG_PERMISSION.CREATE_REQUISITION,
  ORG_PERMISSION.VIEW_REQUISITIONS,
];

/**
 * @param {string} projectId
 */
async function authorizeSelectableFinancialYears(projectId) {
  for (const orgPermission of SELECTABLE_FY_PERMISSIONS) {
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

  if (selectableOnly) {
    const auth = await authorizeSelectableFinancialYears(projectId);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.status === 403 ? "Forbidden." : "Not found." },
        { status: auth.status },
      );
    }
    const rows = await cachedRead(`org-financial-years:${projectId}:active`, FY_MODELS, () =>
      listActiveFinancialYearRows(prisma, projectId),
    );
    return cachedJson(request, selectableFinancialYearsFromRows(rows), { revalidate: true });
  }

  const auth = await authorizeProjectOrgRead(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_FINANCIAL_YEARS,
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

  const { total, rows, latestEndDate } = await cachedRead(
    `org-financial-years:${projectId}:list:${page}:${pageSize}`,
    FY_MODELS,
    async () => {
      const [total, rows, latest] = await Promise.all([
        prisma.projectOrgFinancialYear.count({ where }),
        prisma.projectOrgFinancialYear.findMany({
          where,
          orderBy: [{ startDate: "desc" }, { label: "desc" }],
          skip,
          take: pageSize,
          select: financialYearSelect,
        }),
        prisma.projectOrgFinancialYear.aggregate({ where, _max: { endDate: true } }),
      ]);
      return { total, rows, latestEndDate: latest._max.endDate };
    },
  );

  return cachedJson(request, {
    financialYears: rows.map((row) => serializeProjectOrgFinancialYear(row)),
    latestEndDate: latestEndDate ? toDateInputValue(latestEndDate) : null,
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }, { revalidate: true });
}

const FY_MODELS = ["ProjectOrgFinancialYear", "Project:delete"];

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

  const validated = validateProjectOrgFinancialYearInput(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validated.errors },
      { status: 400 },
    );
  }

  const duplicate = await prisma.projectOrgFinancialYear.findFirst({
    where: { projectId, label: validated.data.label },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json(
      {
        error: "This financial year label already exists for this project.",
        fieldErrors: { label: "Choose a different financial year label." },
      },
      { status: 400 },
    );
  }

  const overlap = await findOverlappingFinancialYear(prisma, projectId, validated.data);
  if (overlap) {
    return NextResponse.json(financialYearOverlapResponse(overlap), { status: 400 });
  }

  const row = await prisma.$transaction(async (tx) => {
    if (validated.data.isActive) {
      await deactivateOtherProjectFinancialYears(tx, projectId);
    }
    return tx.projectOrgFinancialYear.create({
      data: {
        projectId,
        label: validated.data.label,
        description: validated.data.description,
        startDate: validated.data.startDate,
        endDate: validated.data.endDate,
        isActive: validated.data.isActive,
      },
      select: financialYearSelect,
    });
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_FINANCIAL_YEAR_CREATED,
    actorUserId: user.id,
    meta: { projectId, financialYearId: row.id, label: row.label, isActive: row.isActive },
  });

  return NextResponse.json(
    { financialYear: serializeProjectOrgFinancialYear(row) },
    { status: 201 },
  );
}
