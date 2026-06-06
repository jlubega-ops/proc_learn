import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import {
  listActiveProjectFinancialYears,
  planningPeriodSelect,
  resolveActiveProjectFinancialYear,
  serializeProjectOrgPlanningPeriod,
} from "@/lib/projects/org-planning-periods";
import { validateProjectOrgPlanningPeriodInput } from "@/lib/validation/project-org-planning-period";

export const runtime = "nodejs";

export async function GET(request, context) {
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

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSizeRaw = Number(searchParams.get("pageSize") || 10);
  const pageSize = Math.min(50, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10));
  const skip = (page - 1) * pageSize;

  const where = { projectId };

  const [total, rows, activeFinancialYears] = await Promise.all([
    prisma.projectOrgPlanningPeriod.count({ where }),
    prisma.projectOrgPlanningPeriod.findMany({
      where,
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
      select: planningPeriodSelect,
    }),
    listActiveProjectFinancialYears(prisma, projectId),
  ]);

  return NextResponse.json({
    planningPeriods: rows.map((row) => serializeProjectOrgPlanningPeriod(row)),
    activeFinancialYears,
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });
}

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

  const row = await prisma.projectOrgPlanningPeriod.create({
    data: {
      projectId,
      financialYearId: financialYear.id,
      startDate: validated.data.startDate,
      endDate: validated.data.endDate,
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
      periodLabel: serializeProjectOrgPlanningPeriod(row).periodLabel,
    },
  });

  return NextResponse.json(
    { planningPeriod: serializeProjectOrgPlanningPeriod(row) },
    { status: 201 },
  );
}
