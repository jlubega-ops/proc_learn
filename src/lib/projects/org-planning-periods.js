import { formatPlanningPeriodDuration } from "@/lib/planning-period-duration";
import { toDateInputValue } from "@/lib/financial-year-dates";

export const planningPeriodSelect = {
  id: true,
  financialYearId: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  updatedAt: true,
  financialYear: {
    select: { id: true, label: true, isActive: true },
  },
};

/**
 * @param {any} row
 */
export function serializeProjectOrgPlanningPeriod(row) {
  const start = row.startDate ? new Date(row.startDate) : null;
  const end = row.endDate ? new Date(row.endDate) : null;

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
  return prisma.projectOrgFinancialYear.findFirst({
    where: {
      id: financialYearId,
      projectId,
      isActive: true,
    },
    select: { id: true, label: true },
  });
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 */
export async function listActiveProjectFinancialYears(prisma, projectId) {
  return prisma.projectOrgFinancialYear.findMany({
    where: { projectId, isActive: true },
    orderBy: [{ startDate: "desc" }, { label: "desc" }],
    select: { id: true, label: true },
  });
}
