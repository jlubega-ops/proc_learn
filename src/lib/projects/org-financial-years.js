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
 * @param {any} row
 */
export function serializeProjectOrgFinancialYear(row) {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    startDate: row.startDate ? toDateInputValue(new Date(row.startDate)) : null,
    endDate: row.endDate ? toDateInputValue(new Date(row.endDate)) : null,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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
