import { OrgWorkflowInstanceStatus, OrgWorkflowTaskStatus } from "@prisma/client";

/** First department approver role names used across budgeting / planning / requisitions. */
export const HOD_ROLE_NAMES = new Set([
  "Head User Department",
  "Head of User Department",
]);

/**
 * True while the earliest open workflow step is still HOD review (HOD has not acted).
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   entityField: "requisitionId" | "procurementPlanId" | "budgetId";
 *   entityId: string;
 * }} opts
 */
export async function isEntityAwaitingHodReview(prisma, opts) {
  const openTask = await prisma.projectOrgWorkflowTask.findFirst({
    where: {
      projectId: opts.projectId,
      status: { in: [OrgWorkflowTaskStatus.PENDING, OrgWorkflowTaskStatus.IN_PROGRESS] },
      instance: {
        [opts.entityField]: opts.entityId,
        status: {
          in: [OrgWorkflowInstanceStatus.ACTIVE, OrgWorkflowInstanceStatus.IN_PROGRESS],
        },
      },
    },
    orderBy: [{ stepNumber: "asc" }, { createdAt: "asc" }],
    select: { requiredRoleName: true },
  });
  if (!openTask) return false;
  return HOD_ROLE_NAMES.has(String(openTask.requiredRoleName || "").trim());
}

/**
 * Creator mutation rights:
 * - DRAFT → edit + delete
 * - RETURNED (and other editableStatuses except draft) → edit only
 * - SUBMITTED while still awaiting HOD → edit only (no delete)
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   entityField: "requisitionId" | "procurementPlanId" | "budgetId";
 *   entityId: string;
 *   status: string;
 *   creatorOrgUserId: string | null | undefined;
 *   actorOrgUserId: string;
 *   draftStatus: string;
 *   editableStatuses: string[];
 *   submittedStatus: string;
 * }} opts
 * @returns {Promise<{ canEdit: boolean; canDelete: boolean; awaitingHodReview: boolean }>}
 */
export async function getCreatorEntityMutationFlags(prisma, opts) {
  const isCreator =
    Boolean(opts.creatorOrgUserId) && opts.creatorOrgUserId === opts.actorOrgUserId;
  if (!isCreator) {
    return { canEdit: false, canDelete: false, awaitingHodReview: false };
  }

  const status = String(opts.status || "");
  const draftStatus = String(opts.draftStatus || "");

  if (status === draftStatus) {
    return { canEdit: true, canDelete: true, awaitingHodReview: false };
  }

  if (opts.editableStatuses.includes(status)) {
    // Returned (and any other non-draft editable status): edit only
    return { canEdit: true, canDelete: false, awaitingHodReview: false };
  }

  if (status === opts.submittedStatus) {
    const awaitingHodReview = await isEntityAwaitingHodReview(prisma, {
      projectId: opts.projectId,
      entityField: opts.entityField,
      entityId: opts.entityId,
    });
    return {
      canEdit: awaitingHodReview,
      canDelete: false,
      awaitingHodReview,
    };
  }

  return { canEdit: false, canDelete: false, awaitingHodReview: false };
}

/**
 * Cancel open workflow tasks/instances for an entity before delete/withdraw.
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{
 *   projectId: string;
 *   entityField: "requisitionId" | "procurementPlanId" | "budgetId";
 *   entityId: string;
 * }} opts
 */
export async function cancelOpenWorkflowForEntity(db, opts) {
  await db.projectOrgWorkflowTask.updateMany({
    where: {
      projectId: opts.projectId,
      status: { in: [OrgWorkflowTaskStatus.PENDING, OrgWorkflowTaskStatus.IN_PROGRESS] },
      instance: { [opts.entityField]: opts.entityId },
    },
    data: { status: OrgWorkflowTaskStatus.CANCELLED },
  });
  await db.projectOrgWorkflowInstance.updateMany({
    where: {
      projectId: opts.projectId,
      [opts.entityField]: opts.entityId,
      status: {
        in: [
          OrgWorkflowInstanceStatus.ACTIVE,
          OrgWorkflowInstanceStatus.IN_PROGRESS,
          OrgWorkflowInstanceStatus.SUSPENDED,
        ],
      },
    },
    data: {
      status: OrgWorkflowInstanceStatus.CANCELLED,
      completedAt: new Date(),
    },
  });
}
