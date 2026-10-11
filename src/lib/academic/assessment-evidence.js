/**
 * Read-only evidence of what a student did in their organisation, for section scoring.
 */
import { OrgWorkflowDecision } from "@prisma/client";
import { TRIGGER_TO_PROCESS_CODE } from "@/lib/projects/process-catalogue";
import { orgOpsSlateListWhere } from "@/lib/academic/org-academic-slate";
import { SCORING_COUNT_KEYS as K } from "@/lib/academic/assessment-sections";

const POSITIVE_DECISIONS = [
  OrgWorkflowDecision.SUBMIT,
  OrgWorkflowDecision.APPROVE,
  OrgWorkflowDecision.COMPLETE,
  OrgWorkflowDecision.VERIFY,
  OrgWorkflowDecision.SELECT_METHOD,
];

/**
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} orgId
 * @param {{ academicSlateId?: string | null }} [opts]
 * @returns {Promise<import("@/lib/academic/assessment-sections").ScoringEvidence>}
 */
export async function loadScoringEvidence(db, orgId, opts = {}) {
  const slate = orgOpsSlateListWhere(opts.academicSlateId || null);
  const projectId = orgId;
  const instanceWhere = opts.academicSlateId
    ? {
        OR: [
          { budget: { is: slate } },
          { procurementPlan: { is: slate } },
          { requisition: { is: slate } },
          { procurement: { is: slate } },
        ],
      }
    : {};

  const [
    departments,
    subunits,
    users,
    usersInDepartment,
    committees,
    committeeMembers,
    financialYears,
    planningPeriods,
    providers,
    budgets,
    plans,
    emergencyPlans,
    requisitions,
    actions,
  ] = await Promise.all([
    db.projectOrgDepartment.count({ where: { projectId, parentId: null } }),
    db.projectOrgDepartment.count({ where: { projectId, parentId: { not: null } } }),
    db.projectOrgUser.count({ where: { projectId, isProjectAdmin: false } }),
    db.projectOrgUser.count({ where: { projectId, isProjectAdmin: false, departmentId: { not: null } } }),
    db.projectOrgCommittee.count({ where: { projectId } }),
    db.projectOrgCommitteeMember.count({ where: { committee: { projectId } } }),
    db.projectOrgFinancialYear.count({ where: { projectId } }),
    db.projectOrgPlanningPeriod.count({ where: { projectId } }),
    db.projectOrgProvider.count({ where: { projectId } }),
    db.projectOrgBudget.count({ where: { projectId, ...slate } }),
    db.projectOrgProcurementPlan.count({ where: { projectId, isEmergency: false, ...slate } }),
    db.projectOrgProcurementPlan.count({ where: { projectId, isEmergency: true, ...slate } }),
    db.projectOrgRequisition.count({ where: { projectId, ...slate } }),
    db.projectOrgWorkflowAction.findMany({
      where: {
        projectId,
        decision: { in: POSITIVE_DECISIONS },
        instance: instanceWhere,
      },
      select: {
        task: { select: { stepNumber: true } },
        instance: { select: { triggerKey: true, processFlow: { select: { code: true } } } },
      },
      take: 5000,
    }),
  ]);

  /** @type {Record<string, number>} */
  const steps = {};
  for (const action of actions) {
    const code = action.instance?.processFlow?.code || TRIGGER_TO_PROCESS_CODE[action.instance?.triggerKey] || null;
    if (!code) continue;
    const step = action.task?.stepNumber ?? 1;
    const key = `${code}:${step}`;
    steps[key] = (steps[key] || 0) + 1;
  }

  return {
    counts: {
      [K.DEPARTMENTS]: departments,
      [K.SUBUNITS]: subunits,
      [K.USERS]: users,
      [K.USERS_IN_DEPARTMENT]: usersInDepartment,
      [K.COMMITTEES]: committees,
      [K.COMMITTEE_MEMBERS]: committeeMembers,
      [K.FINANCIAL_YEARS]: financialYears,
      [K.PLANNING_PERIODS]: planningPeriods,
      [K.PROVIDERS]: providers,
      [K.BUDGETS]: budgets,
      [K.PLANS]: plans,
      [K.EMERGENCY_PLANS]: emergencyPlans,
      [K.REQUISITIONS]: requisitions,
    },
    steps,
  };
}
