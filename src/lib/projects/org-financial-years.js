import { canManageProjectOrgUsers } from "@/lib/projects/org-users";
import {
  compareUtcCalendarParts,
  formatCalendarDateLabel,
  serverUtcTodayParts,
  toDateInputValue,
  utcCalendarParts,
} from "@/lib/financial-year-dates";

export { canManageProjectOrgUsers as canManageProjectOrgFinancialYears };

export const financialYearSelect = {
  id: true,
  label: true,
  description: true,
  startDate: true,
  endDate: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * Calendar-date check: server UTC today must fall within [startDate, endDate] inclusive.
 * @param {Date | string | null | undefined} startDate
 * @param {Date | string | null | undefined} endDate
 * @param {Date} [now] server clock
 */
export function isFinancialYearCurrentlyValid(startDate, endDate, now = new Date()) {
  const start = utcCalendarParts(startDate);
  const end = utcCalendarParts(endDate);
  if (!start || !end) return false;
  const today = serverUtcTodayParts(now);
  return (
    compareUtcCalendarParts(today, start) >= 0 && compareUtcCalendarParts(today, end) <= 0
  );
}

/**
 * @param {any} row
 */
export function serializeProjectOrgFinancialYear(row) {
  const dateValid = isFinancialYearCurrentlyValid(row.startDate, row.endDate);
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    startDate: row.startDate ? toDateInputValue(new Date(row.startDate)) : null,
    endDate: row.endDate ? toDateInputValue(new Date(row.endDate)) : null,
    isActive: row.isActive,
    isDateValid: dateValid,
    /** True when marked Active and today's date falls within the FY window. */
    isSelectable: Boolean(row.isActive) && dateValid,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Active + currently date-valid financial years for operational forms.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {Date} [now]
 */
export async function listSelectableFinancialYears(prisma, projectId, now = new Date()) {
  const rows = await listActiveFinancialYearRows(prisma, projectId);
  return selectableFinancialYearsFromRows(rows, now);
}

/**
 * Active financial year rows (not yet date-filtered).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 */
export function listActiveFinancialYearRows(prisma, projectId) {
  return prisma.projectOrgFinancialYear.findMany({
    where: { projectId, isActive: true },
    orderBy: [{ startDate: "desc" }, { label: "desc" }],
    select: financialYearSelect,
  });
}

/**
 * @param {any[]} rows active financial year rows
 * @param {Date} [now]
 */
export function selectableFinancialYearsFromRows(rows, now = new Date()) {
  const selectable = rows
    .filter((row) => isFinancialYearCurrentlyValid(row.startDate, row.endDate, now))
    .map((row) => serializeProjectOrgFinancialYear(row));

  const activeOutsideWindow = rows.filter(
    (row) => !isFinancialYearCurrentlyValid(row.startDate, row.endDate, now),
  ).length;

  return {
    financialYears: selectable,
    total: selectable.length,
    emptyReason:
      selectable.length > 0
        ? null
        : activeOutsideWindow > 0
          ? "NO_ACTIVE_DATE_VALID_FY"
          : "NO_ACTIVE_FY",
    message:
      selectable.length > 0
        ? null
        : activeOutsideWindow > 0
          ? "No active financial year covers today's date. Ask the Organization Administrator to correct the active financial year dates."
          : "No active financial year is available. Ask the Organization Administrator to create and activate a financial year that covers today's date.",
  };
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {string} projectId
 * @param {string} financialYearId
 * @param {Date} [now]
 */
export async function resolveSelectableFinancialYear(
  prisma,
  projectId,
  financialYearId,
  now = new Date(),
) {
  const row = await prisma.projectOrgFinancialYear.findFirst({
    where: { id: financialYearId, projectId, isActive: true },
    select: financialYearSelect,
  });
  if (!row) return null;
  if (!isFinancialYearCurrentlyValid(row.startDate, row.endDate, now)) return null;
  return row;
}

/**
 * First existing financial year whose dates overlap [startDate, endDate] (inclusive calendar days).
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {string} projectId
 * @param {{ startDate: Date; endDate: Date; excludeId?: string | null }} range
 */
export function findOverlappingFinancialYear(prisma, projectId, { startDate, endDate, excludeId = null }) {
  return prisma.projectOrgFinancialYear.findFirst({
    where: {
      projectId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    orderBy: { startDate: "asc" },
    select: { id: true, label: true, startDate: true, endDate: true },
  });
}

/**
 * Field errors for an overlap with `row` (from {@link findOverlappingFinancialYear}).
 * @param {{ label: string; startDate: Date | string; endDate: Date | string }} row
 */
export function financialYearOverlapResponse(row) {
  const range = `${formatCalendarDateLabel(row.startDate)} – ${formatCalendarDateLabel(row.endDate)}`;
  const message = `Overlaps ${row.label} (${range}).`;
  return {
    error: `Dates overlap financial year ${row.label}.`,
    fieldErrors: { startDate: message, endDate: message },
  };
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {string} projectId
 */
export async function deactivateOtherProjectFinancialYears(prisma, projectId, exceptId = null) {
  await prisma.projectOrgFinancialYear.updateMany({
    where: {
      projectId,
      isActive: true,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    data: { isActive: false },
  });
}
