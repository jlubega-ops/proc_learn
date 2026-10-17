/**
 * After a process (or lifecycle gate) completes, nudge the next actors:
 * in-app notification + a My Tasks reminder that opens the next screen.
 *
 * Cross-process starts (budget→plan, plan→requisition, payment→closure) use
 * these handoffs. In-method steps already get My Tasks via createTasksForStep.
 */
import { OrgWorkflowTaskStatus } from "@prisma/client";
import { notifyOrgUsers, OrgNotificationType } from "@/lib/projects/org-notifications";

/** @typedef {'SUBMIT_PLAN' | 'SUBMIT_REQUISITION' | 'CLOSE_PROCUREMENT'} NextStepKind */

/**
 * @typedef {{
 *   kind: NextStepKind;
 *   titlePrefix: string;
 *   requiredRoleName: string;
 *   roles: string[];
 *   scope: 'department' | 'project';
 *   notifyTitle: string;
 *   body: (recordLabel: string) => string;
 *   href: (projectId: string, relatedEntityId?: string | null) => string;
 * }} NextStepDef
 */

/** @type {Record<NextStepKind, NextStepDef>} */
export const NEXT_STEP = {
  SUBMIT_PLAN: {
    kind: "SUBMIT_PLAN",
    titlePrefix: "Submit procurement plan",
    requiredRoleName: "User Department Officer",
    roles: [
      "User Department Officer",
      "User Department",
      "Head User Department",
      "Head of User Department",
    ],
    scope: "department",
    notifyTitle: "Budget approved",
    body: (label) => `${label} is approved. You can submit a procurement plan against it.`,
    href: (projectId) => `/projects/${projectId}/procurement-plans/new`,
  },
  SUBMIT_REQUISITION: {
    kind: "SUBMIT_REQUISITION",
    titlePrefix: "Submit procurement requisition",
    requiredRoleName: "User Department Officer",
    roles: [
      "User Department Officer",
      "User Department",
      "Head User Department",
      "Head of User Department",
    ],
    scope: "department",
    notifyTitle: "Plan approved",
    body: (label) => `${label} is approved. You can submit a procurement requisition.`,
    href: (projectId) => `/projects/${projectId}/requisitions/new`,
  },
  CLOSE_PROCUREMENT: {
    kind: "CLOSE_PROCUREMENT",
    titlePrefix: "Close procurement",
    requiredRoleName: "Contracts Officer",
    roles: ["Contracts Officer", "Procurement Officer"],
    scope: "project",
    notifyTitle: "Ready for closure",
    body: (label) => `${label} is fully paid. You can start the closure process.`,
    href: (projectId, relatedEntityId) =>
      relatedEntityId
        ? `/projects/${projectId}/procurements/closures/${relatedEntityId}`
        : `/projects/${projectId}/procurements/closures`,
  },
};

/**
 * @param {string} kind
 * @returns {NextStepDef | null}
 */
function defForKind(kind) {
  if (kind === "SUBMIT_REQUISITION") return NEXT_STEP.SUBMIT_REQUISITION;
  if (kind === "CLOSE_PROCUREMENT") return NEXT_STEP.CLOSE_PROCUREMENT;
  if (kind === "SUBMIT_PLAN") return NEXT_STEP.SUBMIT_PLAN;
  return null;
}

/**
 * @param {string} projectId
 * @param {string} title
 * @param {string | null | undefined} [relatedEntityId]
 */
export function nextStepDetailHref(projectId, title, relatedEntityId = null) {
  const t = String(title || "");
  for (const def of Object.values(NEXT_STEP)) {
    if (t.startsWith(def.titlePrefix)) {
      return def.href(projectId, relatedEntityId);
    }
  }
  return null;
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{
 *   projectId: string;
 *   roleNames: string[];
 *   scope: 'department' | 'project';
 *   departmentId?: string | null;
 * }} opts
 */
async function findHandoffRecipients(db, opts) {
  if (!opts.roleNames.length) return [];
  /** @type {Record<string, unknown>} */
  const where = {
    projectId: opts.projectId,
    isProjectAdmin: false,
    projectOrgRole: { name: { in: opts.roleNames }, isActive: true },
  };
  if (opts.scope === "department") {
    if (!opts.departmentId) return [];
    where.departmentId = opts.departmentId;
  }
  return db.projectOrgUser.findMany({
    where,
    select: { id: true, linkedUserId: true, projectOrgRole: { select: { name: true } } },
  });
}

/**
 * Create My Tasks + notifications for the next process after a gate opens.
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{
 *   projectId: string;
 *   instanceId: string;
 *   departmentId?: string | null;
 *   recordLabel: string;
 *   kind: NextStepKind;
 *   excludeOrgUserId?: string | null;
 *   includeOrgUserId?: string | null;
 *   relatedEntityType: string;
 *   relatedEntityId: string;
 * }} opts
 */
export async function createNextProcessHandoff(db, opts) {
  const def = defForKind(opts.kind);
  if (!def) return { tasks: 0, notified: 0 };

  const recipients = await findHandoffRecipients(db, {
    projectId: opts.projectId,
    roleNames: def.roles,
    scope: def.scope,
    departmentId: opts.departmentId,
  });
  if (opts.includeOrgUserId && !recipients.some((r) => r.id === opts.includeOrgUserId)) {
    const extra = await db.projectOrgUser.findUnique({
      where: { id: opts.includeOrgUserId },
      select: { id: true, linkedUserId: true, projectOrgRole: { select: { name: true } } },
    });
    if (extra) recipients.push(extra);
  }
  if (!recipients.length) return { tasks: 0, notified: 0 };

  // If the method workflow already queued a Close Procurement step task, only notify.
  let skipTasks = false;
  if (opts.kind === "CLOSE_PROCUREMENT") {
    const existingStep = await db.projectOrgWorkflowTask.findFirst({
      where: {
        projectId: opts.projectId,
        instanceId: opts.instanceId,
        stepNumber: { gt: 0 },
        status: { in: [OrgWorkflowTaskStatus.PENDING, OrgWorkflowTaskStatus.IN_PROGRESS] },
        title: { startsWith: "Close Procurement" },
      },
      select: { id: true },
    });
    skipTasks = Boolean(existingStep);
  }

  const title = `${def.titlePrefix}: ${opts.recordLabel}`.slice(0, 255);
  const linkUrl = def.href(opts.projectId, opts.relatedEntityId);
  const body = def.body(opts.recordLabel);

  let tasks = 0;
  if (!skipTasks) {
    for (const recipient of recipients) {
      if (opts.excludeOrgUserId && recipient.id === opts.excludeOrgUserId) continue;
      const existing = await db.projectOrgWorkflowTask.findFirst({
        where: {
          projectId: opts.projectId,
          instanceId: opts.instanceId,
          assigneeOrgUserId: recipient.id,
          stepNumber: 0,
          status: { in: [OrgWorkflowTaskStatus.PENDING, OrgWorkflowTaskStatus.IN_PROGRESS] },
          title: { startsWith: def.titlePrefix },
        },
        select: { id: true },
      });
      if (existing) continue;
      await db.projectOrgWorkflowTask.create({
        data: {
          projectId: opts.projectId,
          instanceId: opts.instanceId,
          processFlowItemId: null,
          stepNumber: 0,
          title,
          requiredRoleName: def.requiredRoleName,
          assigneeOrgUserId: recipient.id,
          status: OrgWorkflowTaskStatus.PENDING,
        },
      });
      tasks += 1;
    }
  }

  const notifyRecipients = recipients.filter(
    (r) => !opts.excludeOrgUserId || r.id !== opts.excludeOrgUserId,
  );
  if (notifyRecipients.length) {
    await notifyOrgUsers(db, {
      projectId: opts.projectId,
      recipients: notifyRecipients,
      type: OrgNotificationType.WORKFLOW_APPROVED,
      title: def.notifyTitle,
      body,
      linkUrl,
      relatedEntityType: opts.relatedEntityType,
      relatedEntityId: opts.relatedEntityId,
    });
  }

  return { tasks, notified: notifyRecipients.length };
}

/**
 * Clear next-step reminders once the next process has been started.
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{
 *   projectId: string;
 *   kind: NextStepKind;
 *   departmentId?: string | null;
 *   relatedEntityId?: string | null;
 *   instanceId?: string | null;
 * }} opts
 */
export async function completeNextProcessHandoffs(db, opts) {
  const def = defForKind(opts.kind);
  if (!def) return { completed: 0 };

  /** @type {Record<string, unknown>} */
  const where = {
    projectId: opts.projectId,
    stepNumber: 0,
    processFlowItemId: null,
    status: { in: [OrgWorkflowTaskStatus.PENDING, OrgWorkflowTaskStatus.IN_PROGRESS] },
    title: { startsWith: def.titlePrefix },
  };
  if (opts.instanceId) {
    where.instanceId = opts.instanceId;
  }
  if (opts.departmentId && def.scope === "department") {
    const assignees = await db.projectOrgUser.findMany({
      where: { projectId: opts.projectId, departmentId: opts.departmentId },
      select: { id: true },
    });
    const ids = assignees.map((a) => a.id);
    if (!ids.length) return { completed: 0 };
    where.assigneeOrgUserId = { in: ids };
  }
  if (opts.relatedEntityId && opts.kind === "CLOSE_PROCUREMENT") {
    where.title = { startsWith: `${def.titlePrefix}:` };
    // Narrow by instance when possible; title includes procurement label which may collide.
  }

  const result = await db.projectOrgWorkflowTask.updateMany({
    where,
    data: { status: OrgWorkflowTaskStatus.COMPLETED, completedAt: new Date() },
  });
  return { completed: result.count };
}

/**
 * Resolve the method workflow instance for a procurement (needed for handoff tasks).
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{ projectId: string; procurementId: string; includeCompleted?: boolean }} opts
 */
export async function findProcurementWorkflowInstance(db, opts) {
  return db.projectOrgWorkflowInstance.findFirst({
    where: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      status: opts.includeCompleted
        ? { in: ["ACTIVE", "IN_PROGRESS", "COMPLETED"] }
        : { in: ["ACTIVE", "IN_PROGRESS"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}
