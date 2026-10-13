/**
 * Pre-delete checks for organisation configuration rows that business records point to.
 * Each returns a short user-facing reason, or null when the delete is safe. Deleting would
 * otherwise fail on a Restrict foreign key (500) or silently null out history (SetNull).
 */
import { OrgWorkflowTaskStatus, Prisma } from "@prisma/client";

/** @typedef {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} Db */

export const IN_USE_MESSAGE = "This record is in use and cannot be deleted.";

/** Prisma foreign-key / required-relation violation (record still referenced). */
export function isForeignKeyViolation(error) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2003" || error.code === "P2014")
  );
}

/** @param {Record<string, number>} counts */
function firstUsed(counts) {
  const used = Object.entries(counts).filter(([, n]) => n > 0).map(([label]) => label);
  return used.length ? used.join(", ") : null;
}

/**
 * @param {Db} db
 * @param {string} projectId
 * @param {string} financialYearId
 */
export async function financialYearDeleteBlocker(db, projectId, financialYearId) {
  const where = { projectId, financialYearId };
  const [periods, budgets, budgetLines, plans, requisitions, procurements] = await Promise.all([
    db.projectOrgPlanningPeriod.count({ where }),
    db.projectOrgBudget.count({ where }),
    db.projectOrgBudgetLine.count({ where }),
    db.projectOrgProcurementPlan.count({ where }),
    db.projectOrgRequisition.count({ where }),
    db.projectOrgProcurement.count({ where }),
  ]);
  const used = firstUsed({
    "planning periods": periods,
    budgets: budgets + budgetLines,
    "procurement plans": plans,
    requisitions,
    procurements,
  });
  return used ? `This financial year is used by ${used}. It cannot be deleted.` : null;
}

/**
 * @param {Db} db
 * @param {string} projectId
 * @param {string[]} departmentIds department plus its subunits
 */
export async function departmentDeleteBlocker(db, projectId, departmentIds) {
  const inDept = { projectId, departmentId: { in: departmentIds } };
  const [users, budgets, budgetLines, plans, requisitions, procurements] = await Promise.all([
    db.projectOrgUser.count({
      where: { projectId, OR: [{ departmentId: { in: departmentIds } }, { subunitId: { in: departmentIds } }] },
    }),
    db.projectOrgBudget.count({ where: inDept }),
    db.projectOrgBudgetLine.count({ where: inDept }),
    db.projectOrgProcurementPlan.count({ where: inDept }),
    db.projectOrgRequisition.count({ where: inDept }),
    db.projectOrgProcurement.count({ where: inDept }),
  ]);
  if (users > 0) return "Remove or reassign users linked to this department before deleting it.";
  const used = firstUsed({
    budgets: budgets + budgetLines,
    "procurement plans": plans,
    requisitions,
    procurements,
  });
  return used ? `This department is used by ${used}. It cannot be deleted.` : null;
}

/**
 * Org users with procurement history keep the approval trail intact (names on printouts).
 * @param {Db} db
 * @param {string} orgUserId
 */
export async function orgUserDeleteBlocker(db, orgUserId) {
  const id = orgUserId;
  const [
    requisitions,
    reqApproved,
    budgets,
    budgetsApproved,
    plans,
    plansApproved,
    actions,
    openTasks,
    procurements,
    procurementsClosed,
    instructions,
    awards,
    deliveries,
    inspections,
  ] = await Promise.all([
    db.projectOrgRequisition.count({ where: { requesterOrgUserId: id } }),
    db.projectOrgRequisition.count({ where: { approvedByOrgUserId: id } }),
    db.projectOrgBudget.count({ where: { createdByOrgUserId: id } }),
    db.projectOrgBudget.count({ where: { approvedByOrgUserId: id } }),
    db.projectOrgProcurementPlan.count({ where: { createdByOrgUserId: id } }),
    db.projectOrgProcurementPlan.count({ where: { approvedByOrgUserId: id } }),
    db.projectOrgWorkflowAction.count({ where: { actorOrgUserId: id } }),
    db.projectOrgWorkflowTask.count({
      where: {
        assigneeOrgUserId: id,
        status: { in: [OrgWorkflowTaskStatus.PENDING, OrgWorkflowTaskStatus.IN_PROGRESS] },
      },
    }),
    db.projectOrgProcurement.count({ where: { officerOrgUserId: id } }),
    db.projectOrgProcurement.count({ where: { closedByOrgUserId: id } }),
    db.projectOrgPurchaseInstruction.count({ where: { issuedByOrgUserId: id } }),
    db.projectOrgAward.count({ where: { approvedByOrgUserId: id } }),
    db.projectOrgDelivery.count({ where: { recordedByOrgUserId: id } }),
    db.projectOrgInspection.count({ where: { inspectedByOrgUserId: id } }),
  ]);
  if (openTasks > 0) return "This user has pending tasks. Reassign them before deleting the user.";
  const history =
    requisitions +
    reqApproved +
    budgets +
    budgetsApproved +
    plans +
    plansApproved +
    actions +
    procurements +
    procurementsClosed +
    instructions +
    awards +
    deliveries +
    inspections;
  return history > 0
    ? "This user appears in procurement records, so they cannot be deleted."
    : null;
}

/**
 * @param {Db} db
 * @param {string} projectId
 * @param {string} planningPeriodId
 */
export async function planningPeriodDeleteBlocker(db, projectId, planningPeriodId) {
  const plans = await db.projectOrgProcurementPlan.count({ where: { projectId, planningPeriodId } });
  return plans > 0 ? "This planning period is used by procurement plans. It cannot be deleted." : null;
}

/**
 * @param {Db} db
 * @param {string} roleId
 */
export async function orgRoleDeleteBlocker(db, roleId) {
  const [users, steps] = await Promise.all([
    db.projectOrgUser.count({ where: { projectOrgRoleId: roleId } }),
    db.projectOrgProcessFlowItem.count({ where: { projectOrgRoleId: roleId } }),
  ]);
  if (users > 0) return "Users in project workspaces hold this role. It cannot be deleted.";
  if (steps > 0) return "Process steps use this role. It cannot be deleted.";
  return null;
}

/**
 * @param {Db} db
 * @param {string} processFlowId
 */
export async function processFlowDeleteBlocker(db, processFlowId) {
  const instances = await db.projectOrgWorkflowInstance.count({ where: { processFlowId } });
  return instances > 0 ? "This process has approval history. It cannot be deleted." : null;
}
