import { formatPlanningPeriodDuration } from "@/lib/planning-period-duration";
import {
  compareUtcCalendarParts,
  serverUtcTodayParts,
  toDateInputValue,
  utcCalendarParts,
} from "@/lib/financial-year-dates";
import { OrgPlanningPeriodStatus } from "@prisma/client";

export const planningPeriodSelect = {
  id: true,
  financialYearId: true,
  label: true,
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
 * Human label for planning period status chips/tables.
 * @param {string} status
 */
export function planningPeriodStatusLabel(status) {
  const s = String(status || "").toUpperCase();
  if (s === OrgPlanningPeriodStatus.OPEN) return "Open";
  if (s === OrgPlanningPeriodStatus.UPCOMING) return "Upcoming";
  if (s === OrgPlanningPeriodStatus.CLOSED) return "Ended";
  return s || "—";
}

/**
 * Date-based planning period status using **server** UTC calendar days.
 * Never use the client's local clock for this.
 *
 * @param {Date | string | null | undefined} startDate
 * @param {Date | string | null | undefined} endDate
 * @param {Date} [now] server clock
 */
export function computePlanningPeriodStatus(startDate, endDate, now = new Date()) {
  const start = utcCalendarParts(startDate);
  const end = utcCalendarParts(endDate);
  if (!start || !end) return OrgPlanningPeriodStatus.UPCOMING;

  const today = serverUtcTodayParts(now);
  if (compareUtcCalendarParts(today, start) < 0) return OrgPlanningPeriodStatus.UPCOMING;
  if (compareUtcCalendarParts(today, end) > 0) return OrgPlanningPeriodStatus.CLOSED;
  return OrgPlanningPeriodStatus.OPEN;
}

/**
 * @param {any} row
 * @param {Date} [now] server clock
 */
export function serializeProjectOrgPlanningPeriod(row, now = new Date()) {
  const startParts = utcCalendarParts(row.startDate);
  const endParts = utcCalendarParts(row.endDate);
  const start = startParts ? new Date(startParts.y, startParts.m, startParts.d) : null;
  const end = endParts ? new Date(endParts.y, endParts.m, endParts.d) : null;
  const status = computePlanningPeriodStatus(row.startDate, row.endDate, now);
  const label =
    typeof row.label === "string" && row.label.trim() ? row.label.trim() : null;

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
    label,
    startDate: startParts ? toDateInputValue(row.startDate) : null,
    endDate: endParts ? toDateInputValue(row.endDate) : null,
    /** Inclusive duration between start and end (auto). */
    periodLabel: formatPlanningPeriodDuration(start, end),
    status,
    statusLabel: planningPeriodStatusLabel(status),
    /** Server UTC calendar date used for status (YYYY-MM-DD). */
    serverToday: toDateInputValue(now),
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
