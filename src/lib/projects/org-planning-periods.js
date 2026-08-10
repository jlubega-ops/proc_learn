import { formatPlanningPeriodDuration } from "@/lib/planning-period-duration";
import { toDateInputValue } from "@/lib/financial-year-dates";
import { OrgPlanningPeriodStatus } from "@prisma/client";

export const planningPeriodSelect = {
  id: true,
  financialYearId: true,
  startDate: true,
  endDate: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  financialYear: {
    select: { id: true, label: true, isActive: true },
  },
};

/**
 * Date-based planning period status (calendar dates, local midnight ok).
 * @param {Date | string | null | undefined} startDate
 * @param {Date | string | null | undefined} endDate
 * @param {Date} [now]
 */
export function computePlanningPeriodStatus(startDate, endDate, now = new Date()) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return OrgPlanningPeriodStatus.UPCOMING;
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  if (today < s) return OrgPlanningPeriodStatus.UPCOMING;
  if (today > e) return OrgPlanningPeriodStatus.CLOSED;
  return OrgPlanningPeriodStatus.OPEN;
}

/**
 * @param {any} row
 */
export function serializeProjectOrgPlanningPeriod(row) {
  const start = row.startDate ? new Date(row.startDate) : null;
  const end = row.endDate ? new Date(row.endDate) : null;
  const status = computePlanningPeriodStatus(start, end);

  return {
    id: row.id,
    financialYearId: row.financialYearId,
    financialYear: row.financialYear
      ? {
          id: row.financialYear.id,
          label: row.financialYear.label,
          isActive: row.financialYear.isActive,
        }
      : null,
    startDate: start ? toDateInputValue(start) : null,
    endDate: end ? toDateInputValue(end) : null,
    periodLabel: formatPlanningPeriodDuration(start, end),
    status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} financialYearId
 */
export async function resolveActiveProjectFinancialYear(prisma, projectId, financialYearId) {
  const { isFinancialYearCurrentlyValid } = await import("@/lib/projects/org-financial-years");
  const row = await prisma.projectOrgFinancialYear.findFirst({
    where: {
      id: financialYearId,
      projectId,
      isActive: true,
    },
    select: { id: true, label: true, startDate: true, endDate: true },
  });
  if (!row || !isFinancialYearCurrentlyValid(row.startDate, row.endDate)) return null;
  return { id: row.id, label: row.label };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 */
export async function listActiveProjectFinancialYears(prisma, projectId) {
  const { isFinancialYearCurrentlyValid } = await import("@/lib/projects/org-financial-years");
  const rows = await prisma.projectOrgFinancialYear.findMany({
    where: { projectId, isActive: true },
    orderBy: [{ startDate: "desc" }, { label: "desc" }],
    select: { id: true, label: true, startDate: true, endDate: true },
  });
  return rows
    .filter((row) => isFinancialYearCurrentlyValid(row.startDate, row.endDate))
    .map((row) => ({ id: row.id, label: row.label }));
}
