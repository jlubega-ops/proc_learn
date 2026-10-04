import { getActiveCommittee, partitionTasksForActingMode } from "@/lib/projects/committee-context";
import { procurementSectionSlug } from "@/lib/projects/procurement-stage-pages";
import { procurementTaskStage } from "@/lib/projects/procurement-task-stage";

/**
 * Sidebar paths (relative to `/projects/[id]`) a pending task counts towards. Procurement
 * tasks also count on the section link that holds the step (e.g. Purchase Instructions).
 * @param {{ budgetId?: string | null; procurementPlanId?: string | null; requisitionId?: string | null; procurementId?: string | null; procurement?: { procurementMethod?: string | null } | null } | null} instance
 * @param {string | null | undefined} [title]
 * @returns {string[]}
 */
export function navPathsForTaskInstance(instance, title) {
  if (!instance) return [];
  if (instance.procurementId) {
    const slug = procurementSectionSlug(procurementTaskStage(title), instance.procurement?.procurementMethod);
    return ["procurements", ...(slug ? [`procurements/${slug}`] : [])];
  }
  if (instance.budgetId) return ["budgets"];
  if (instance.procurementPlanId) return ["procurement-plans"];
  if (instance.requisitionId) return ["requisitions"];
  return [];
}

/**
 * Pending task counts for the signed-in org user, keyed by sidebar href.
 * Uses the same acting-mode filter as My Tasks so the totals match.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; orgUserId: string }} opts
 * @returns {Promise<{ total: number; byHref: Record<string, number> }>}
 */
export async function countPendingTasksForNav(prisma, { projectId, orgUserId }) {
  const [tasks, activeCommittee] = await Promise.all([
    prisma.projectOrgWorkflowTask.findMany({
      where: {
        projectId,
        assigneeOrgUserId: orgUserId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      select: {
        title: true,
        requiredRoleName: true,
        instance: {
          select: {
            budgetId: true,
            procurementPlanId: true,
            requisitionId: true,
            procurementId: true,
            procurement: { select: { procurementMethod: true } },
          },
        },
      },
    }),
    getActiveCommittee(prisma, orgUserId),
  ]);

  const { visible } = partitionTasksForActingMode(tasks, activeCommittee);
  const base = `/projects/${projectId}`;
  /** @type {Record<string, number>} */
  const byHref = { [`${base}/tasks`]: visible.length };
  for (const t of visible) {
    for (const path of navPathsForTaskInstance(t.instance, t.title)) {
      const href = `${base}/${path}`;
      byHref[href] = (byHref[href] || 0) + 1;
    }
  }
  return { total: visible.length, byHref };
}
