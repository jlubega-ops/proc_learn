import { canManageProjectOrgUsers } from "@/lib/projects/org-users";
import { toDateInputValue } from "@/lib/financial-year-dates";

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
 * Calendar-date check: today must fall within [startDate, endDate] inclusive.
 * @param {Date | string | null | undefined} startDate
 * @param {Date | string | null | undefined} endDate
 * @param {Date} [now]
 */
export function isFinancialYearCurrentlyValid(startDate, endDate, now = new Date()) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return today >= s && today <= e;
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
  const rows = await prisma.projectOrgFinancialYear.findMany({
    where: { projectId, isActive: true },
    orderBy: [{ startDate: "desc" }, { label: "desc" }],
    select: financialYearSelect,
  });
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
