import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import { authorizeProjectOrgRead } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import {
  deactivateOtherProjectFinancialYears,
  financialYearSelect,
  serializeProjectOrgFinancialYear,
} from "@/lib/projects/org-financial-years";
import { validateProjectOrgFinancialYearInput } from "@/lib/validation/project-org-financial-year";

export const runtime = "nodejs";

export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

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

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSizeRaw = Number(searchParams.get("pageSize") || 10);
  const pageSize = Math.min(50, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10));
  const skip = (page - 1) * pageSize;

  const where = { projectId };

  const [total, rows] = await Promise.all([
    prisma.projectOrgFinancialYear.count({ where }),
    prisma.projectOrgFinancialYear.findMany({
      where,
      orderBy: [{ startDate: "desc" }, { label: "desc" }],
      skip,
      take: pageSize,
      select: financialYearSelect,
    }),
  ]);

  return NextResponse.json({
    financialYears: rows.map((row) => serializeProjectOrgFinancialYear(row)),
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
