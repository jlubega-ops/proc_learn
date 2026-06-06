import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import {
  deactivateOtherProjectFinancialYears,
  financialYearSelect,
  serializeProjectOrgFinancialYear,
} from "@/lib/projects/org-financial-years";
import { validateProjectOrgFinancialYearPatch } from "@/lib/validation/project-org-financial-year";

export const runtime = "nodejs";

async function requireOrgAdmin(prisma, { projectId, userId, activeRole }) {
  const auth = await authorizeProjectOrgAdmin(prisma, { projectId, userId, activeRole });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }
  return null;
}

export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const financialYearId = String(params?.financialYearId || "").trim();
  if (!projectId || !financialYearId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const denied = await requireOrgAdmin(prisma, {
    projectId,
    userId: user.id,
    activeRole,
  });
  if (denied) return denied;

  const existing = await prisma.projectOrgFinancialYear.findFirst({
    where: { id: financialYearId, projectId },
    select: financialYearSelect,
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validated = validateProjectOrgFinancialYearPatch(body, {
    current: {
      label: existing.label,
      description: existing.description,
      startDate: new Date(existing.startDate),
      endDate: new Date(existing.endDate),
      isActive: existing.isActive,
    },
  });
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validated.errors },
      { status: 400 },
    );
  }

  if (validated.data.label && validated.data.label !== existing.label) {
    const duplicate = await prisma.projectOrgFinancialYear.findFirst({
      where: { projectId, label: String(validated.data.label), id: { not: financialYearId } },
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
  }

  const row = await prisma.$transaction(async (tx) => {
    if (validated.data.isActive === true) {
      await deactivateOtherProjectFinancialYears(tx, projectId, financialYearId);
    }
    return tx.projectOrgFinancialYear.update({
      where: { id: financialYearId },
      data: validated.data,
      select: financialYearSelect,
    });
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_FINANCIAL_YEAR_UPDATED,
    actorUserId: user.id,
    meta: {
      projectId,
      financialYearId: row.id,
      label: row.label,
      isActive: row.isActive,
    },
  });

  return NextResponse.json({ financialYear: serializeProjectOrgFinancialYear(row) });
}

export async function DELETE(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const financialYearId = String(params?.financialYearId || "").trim();
  if (!projectId || !financialYearId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const denied = await requireOrgAdmin(prisma, {
    projectId,
    userId: user.id,
    activeRole,
  });
  if (denied) return denied;

  const existing = await prisma.projectOrgFinancialYear.findFirst({
    where: { id: financialYearId, projectId },
    select: { id: true, label: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const linkedPeriods = await prisma.projectOrgPlanningPeriod.count({
    where: { projectId, financialYearId },
  });
  if (linkedPeriods > 0) {
    return NextResponse.json(
      { error: "Remove or reassign planning periods linked to this financial year before deleting it." },
      { status: 400 },
    );
  }

  await prisma.projectOrgFinancialYear.delete({ where: { id: financialYearId } });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_FINANCIAL_YEAR_DELETED,
    actorUserId: user.id,
    meta: { projectId, financialYearId, label: existing.label },
  });

  return NextResponse.json({ ok: true });
}
