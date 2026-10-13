import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import {
  computePlanningPeriodStatus,
  planningPeriodSelect,
  resolveActiveProjectFinancialYear,
  serializeProjectOrgPlanningPeriod,
} from "@/lib/projects/org-planning-periods";
import { validateProjectOrgPlanningPeriodPatch } from "@/lib/validation/project-org-planning-period";
import { planningPeriodDeleteBlocker } from "@/lib/projects/delete-guards";

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
  const planningPeriodId = String(params?.planningPeriodId || "").trim();
  if (!projectId || !planningPeriodId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const denied = await requireOrgAdmin(prisma, {
    projectId,
    userId: user.id,
    activeRole,
  });
  if (denied) return denied;

  const existing = await prisma.projectOrgPlanningPeriod.findFirst({
    where: { id: planningPeriodId, projectId },
    select: planningPeriodSelect,
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validated = validateProjectOrgPlanningPeriodPatch(body, {
    current: {
      financialYearId: existing.financialYearId,
      label: existing.label,
      startDate: new Date(existing.startDate),
      endDate: new Date(existing.endDate),
    },
  });
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validated.errors },
      { status: 400 },
    );
  }

  if (validated.data.financialYearId) {
    const financialYear = await resolveActiveProjectFinancialYear(
      prisma,
      projectId,
      String(validated.data.financialYearId),
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
    validated.data.financialYearId = financialYear.id;
  }

  const nextStart =
    validated.data.startDate !== undefined
      ? validated.data.startDate
      : existing.startDate;
  const nextEnd =
    validated.data.endDate !== undefined ? validated.data.endDate : existing.endDate;
  const now = new Date();
  validated.data.status = computePlanningPeriodStatus(
    /** @type {Date} */ (nextStart),
    /** @type {Date} */ (nextEnd),
    now,
  );

  const row = await prisma.projectOrgPlanningPeriod.update({
    where: { id: planningPeriodId },
    data: validated.data,
    select: planningPeriodSelect,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PLANNING_PERIOD_UPDATED,
    actorUserId: user.id,
    meta: {
      projectId,
      planningPeriodId: row.id,
      financialYearId: row.financialYearId,
      label: row.label,
      periodLabel: serializeProjectOrgPlanningPeriod(row, now).periodLabel,
      status: row.status,
    },
  });

  return NextResponse.json({ planningPeriod: serializeProjectOrgPlanningPeriod(row, now) });
}

export async function DELETE(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const planningPeriodId = String(params?.planningPeriodId || "").trim();
  if (!projectId || !planningPeriodId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const denied = await requireOrgAdmin(prisma, {
    projectId,
    userId: user.id,
    activeRole,
  });
  if (denied) return denied;

  const existing = await prisma.projectOrgPlanningPeriod.findFirst({
    where: { id: planningPeriodId, projectId },
    select: { id: true, financialYearId: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const blocker = await planningPeriodDeleteBlocker(prisma, projectId, planningPeriodId);
  if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });

  await prisma.projectOrgPlanningPeriod.delete({ where: { id: planningPeriodId } });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PLANNING_PERIOD_DELETED,
    actorUserId: user.id,
    meta: { projectId, planningPeriodId, financialYearId: existing.financialYearId },
  });

  return NextResponse.json({ ok: true });
}
