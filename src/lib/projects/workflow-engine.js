import {
  OrgBudgetStatus,
  OrgProcurementPlanStatus,
  OrgProcurementStatus,
  OrgRequisitionStatus,
  OrgWorkflowDecision,
  OrgWorkflowInstanceStatus,
  OrgWorkflowTaskStatus,
  Prisma,
} from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { isTxClient, runInTx } from "@/lib/db-tx";
import { throttleSync } from "@/lib/sync-throttle";
import { committeeTypeForWorkflowRole } from "@/lib/projects/committee-context";
import { processCodeOfFlow } from "@/lib/projects/process-dependencies";
import {
  processDisabledForProgrammeMessage,
  resolveEffectiveProcessCodes,
} from "@/lib/academic/programme-processes";
import {
  WORKFLOW_TRIGGERS,
  TRIGGER_TO_PROCESS_CODE,
  ENGINE_PROCESS_BINDINGS,
  migrateLegacyProcessAdoptions,
  ensureBaselineProcessTemplates,
} from "@/lib/projects/process-catalogue";
import {
  notifyOrgUsers,
  OrgNotificationType,
} from "@/lib/projects/org-notifications";
import { createNextProcessHandoff } from "@/lib/projects/next-process-handoffs";

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} triggerKey
 */
export async function findActiveProcessForTrigger(prisma, projectId, triggerKey) {
  const code = TRIGGER_TO_PROCESS_CODE[triggerKey] || null;
  return prisma.projectOrgProcessFlowAdoption.findFirst({
    where: {
      projectId,
      isActive: true,
      processFlow: code
        ? { OR: [{ triggerKey }, { code }] }
        : { triggerKey },
    },
    include: {
      processFlow: {
        include: {
          items: {
            orderBy: { stepNumber: "asc" },
            include: { projectOrgRole: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
}

/**
 * Blocks work on a process the programme × year list (or the examiner) no longer allows.
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {string} projectId
 * @param {{ code?: string | null; triggerKey?: string | null; name?: string | null } | null | undefined} flow
 */
async function programmeFreezeResult(prisma, projectId, flow) {
  const code = processCodeOfFlow(flow);
  if (!code) return null;
  const allowed = await resolveEffectiveProcessCodes(prisma, projectId);
  if (!allowed || allowed.includes(code)) return null;
  return {
    ok: false,
    error: processDisabledForProgrammeMessage(flow?.name || "process"),
    code: "PROCESS_FROZEN",
    status: 403,
  };
}

/**
 * Roles that must match the requisition department (or subunit under it).
 */
const DEPARTMENT_SCOPED_ROLES = new Set([
  "User Department Officer",
  "Head User Department",
  "User Department",
  "Head of User Department",
]);

/** User Department roles only see / act on their own department's records. */
export function isDepartmentScopedRole(roleName) {
  return DEPARTMENT_SCOPED_ROLES.has(String(roleName || ""));
}

/** Legacy / alternate role labels that map to the same workflow assignees. */
const ROLE_NAME_ALIASES = {
  "User Department Officer": ["User Department Officer", "User Department"],
  "User Department": ["User Department", "User Department Officer"],
  "Head User Department": ["Head User Department", "Head of User Department"],
  "Head of User Department": ["Head of User Department", "Head User Department"],
};

/**
 * @param {string} roleName
 * @returns {string[]}
 */
export function expandOrgRoleNames(roleName) {
  const name = String(roleName || "").trim();
  if (!name) return [];
  return ROLE_NAME_ALIASES[name] || [name];
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {{
 *   projectId: string;
 *   roleName: string;
 *   departmentId?: string | null;
 *   strictDepartment?: boolean;
 * }} opts
 */
export async function resolveEligibleOrgUsers(prisma, opts) {
  const roleName = String(opts.roleName || "").trim();

  // Committee routing roles are hats worn by seated members, not login org roles.
  const committeeType = committeeTypeForWorkflowRole(roleName);
  if (committeeType) {
    const memberships = await prisma.projectOrgCommitteeMember.findMany({
      where: {
        status: "ACTIVE",
        committee: {
          projectId: opts.projectId,
          isActive: true,
          committeeType,
        },
      },
      include: {
        orgUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            linkedUserId: true,
            departmentId: true,
            isProjectAdmin: true,
          },
        },
      },
    });
    const seen = new Set();
    /** @type {Array<{ id: string; firstName: string; lastName: string; email: string; linkedUserId: string | null; departmentId: string | null }>} */
    const users = [];
    for (const m of memberships) {
      const u = m.orgUser;
      if (!u || u.isProjectAdmin || seen.has(u.id)) continue;
      seen.add(u.id);
      users.push({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        linkedUserId: u.linkedUserId,
        departmentId: u.departmentId,
      });
    }
    return users.sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
    );
  }

  const roleNames = expandOrgRoleNames(roleName);
  if (roleNames.length === 0) return [];

  const where = {
    projectId: opts.projectId,
    isProjectAdmin: false,
    projectOrgRole: { name: { in: roleNames }, isActive: true },
  };

  if (opts.departmentId && (opts.strictDepartment || DEPARTMENT_SCOPED_ROLES.has(opts.roleName))) {
    where.departmentId = opts.departmentId;
  }

  return prisma.projectOrgUser.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      linkedUserId: true,
      departmentId: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {{
 *   projectId: string;
 *   instanceId: string;
 *   step: any;
 *   departmentId?: string | null;
 *   entityTitle?: string | null;
 * }} opts
 */
export async function createTasksForStep(prisma, opts) {
  const roleName = opts.step.projectOrgRole?.name || "";
  if (!roleName) {
    return { tasks: [], eligibleCount: 0, error: "Process step has no role assigned.", roleName: "" };
  }
  const strictDepartment = DEPARTMENT_SCOPED_ROLES.has(roleName);
  const eligible = await resolveEligibleOrgUsers(prisma, {
    projectId: opts.projectId,
    roleName,
    departmentId: opts.departmentId || null,
    strictDepartment,
  });

  const entityTitle = String(opts.entityTitle || "").trim();
  const baseTitle = String(opts.step.taskDescription || "Workflow task").trim();
  const title = (entityTitle ? `${baseTitle}: ${entityTitle}` : baseTitle).slice(0, 255);

  const tasks = [];
  for (const user of eligible) {
    const task = await prisma.projectOrgWorkflowTask.create({
      data: {
        projectId: opts.projectId,
        instanceId: opts.instanceId,
        processFlowItemId: opts.step.id,
        stepNumber: opts.step.stepNumber,
        title,
        requiredRoleName: roleName,
        assigneeOrgUserId: user.id,
        status: OrgWorkflowTaskStatus.PENDING,
      },
    });
    tasks.push(task);
  }

  if (eligible.length > 0) {
    try {
      await notifyOrgUsers(prisma, {
        projectId: opts.projectId,
        recipients: eligible,
        type: OrgNotificationType.WORKFLOW_TASK,
        title: "Next step ready",
        body: `${title} is ready for your action. Open My Tasks to continue.`,
        linkUrl: `/projects/${opts.projectId}/tasks`,
        relatedEntityType: "workflow_instance",
        relatedEntityId: opts.instanceId,
      });
    } catch {
      // Non-fatal: tasks remain the source of truth.
    }
  }

  return { tasks, eligibleCount: tasks.length, roleName };
}

/**
 * If the active workflow step has no PENDING tasks (e.g. assignee was missing when
 * the previous step advanced), create them now for currently eligible users.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} [budgetId]
 */
export async function healMissingStepTasks(prisma, projectId, budgetId = null) {
  await healThrottled(prisma, projectId, budgetId);
  return { created: 0 };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string | null} [budgetId]
 */
async function healMissingStepTasksNow(prisma, projectId, budgetId = null) {
  const instances = await prisma.projectOrgWorkflowInstance.findMany({
    where: {
      projectId,
      status: {
        in: [OrgWorkflowInstanceStatus.ACTIVE, OrgWorkflowInstanceStatus.IN_PROGRESS],
      },
      ...(budgetId ? { budgetId } : {}),
    },
    include: {
      processFlow: {
        include: {
          items: {
            orderBy: { stepNumber: "asc" },
            include: { projectOrgRole: { select: { id: true, name: true } } },
          },
        },
      },
      budget: { select: { departmentId: true, title: true } },
      procurementPlan: { select: { departmentId: true, title: true } },
      requisition: { select: { departmentId: true, title: true } },
      procurement: { select: { departmentId: true, title: true, procurementNumber: true } },
      tasks: {
        where: { status: OrgWorkflowTaskStatus.PENDING },
        select: { id: true, stepNumber: true, requiredRoleName: true },
      },
    },
  });

  let created = 0;
  for (const instance of instances) {
    const items = instance.processFlow?.items || [];
    const current = items.find((i) => i.stepNumber === instance.currentStepNumber);
    // The current step was retired from the catalogue: move on to the next remaining step.
    const step = current || items.find((i) => i.stepNumber > instance.currentStepNumber);
    if (!step) continue;
    let tasks = current ? instance.tasks || [] : [];
    // The catalogue moved this step to another role: re-route its open tasks.
    const roleName = step.projectOrgRole?.name || "";
    const misrouted = tasks.filter(
      (t) => t.stepNumber === step.stepNumber && roleName && t.requiredRoleName && t.requiredRoleName !== roleName,
    );
    tasks = tasks.filter((t) => !misrouted.includes(t));
    const hasPending = tasks.some((t) => t.stepNumber === step.stepNumber);
    if (current && !misrouted.length && hasPending) continue;

    created += await runInTx(prisma, async (tx) => {
      if (!current) {
        await tx.projectOrgWorkflowTask.updateMany({
          where: {
            instanceId: instance.id,
            stepNumber: instance.currentStepNumber,
            status: { in: [OrgWorkflowTaskStatus.PENDING, OrgWorkflowTaskStatus.IN_PROGRESS] },
          },
          data: { status: OrgWorkflowTaskStatus.CANCELLED },
        });
        await tx.projectOrgWorkflowInstance.update({
          where: { id: instance.id },
          data: { currentStepNumber: step.stepNumber },
        });
      }
      if (misrouted.length) {
        await tx.projectOrgWorkflowTask.updateMany({
          where: { id: { in: misrouted.map((t) => t.id) }, status: OrgWorkflowTaskStatus.PENDING },
          data: { status: OrgWorkflowTaskStatus.CANCELLED },
        });
      }
      if (hasPending) return 0;
      const result = await createTasksForStep(tx, {
        projectId,
        instanceId: instance.id,
        step,
        departmentId:
          instance.requisition?.departmentId ||
          instance.procurementPlan?.departmentId ||
          instance.budget?.departmentId ||
          instance.procurement?.departmentId ||
          null,
        entityTitle:
          instance.budget?.title ||
          instance.procurementPlan?.title ||
          instance.requisition?.title ||
          (instance.procurement
            ? `${instance.procurement.procurementNumber}: ${instance.procurement.title}`
            : null),
      });
      return result.eligibleCount || 0;
    });
  }
  return { created };
}

/**
 * Repair legacy catalogue adoptions (name-only rows without triggerKey) before a trigger lookup.
 * Call outside any transaction.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 */
export async function prepareWorkflowTriggers(prisma, projectId) {
  try {
    await ensureBaselineProcessTemplates(prisma);
    await migrateProjectAdoptions(prisma, projectId);
  } catch {
    // Non-fatal — lookup may still succeed if already migrated.
  }
}

const migrateProjectAdoptions = throttleSync(
  10 * 60_000,
  (prisma, projectId) => migrateLegacyProcessAdoptions(prisma, { projectId }),
  (_prisma, projectId) => String(projectId || ""),
);

/**
 * Task repair runs from list/detail GETs; once a minute per project scope is plenty.
 */
const healThrottled = throttleSync(
  60_000,
  (prisma, projectId, budgetId) => healMissingStepTasksNow(prisma, projectId, budgetId),
  (_prisma, projectId, budgetId) => `${projectId}|${budgetId || ""}`,
);

/**
 * Start a workflow instance for an entity when its trigger fires.
 * Pass a transaction client to start it inside the caller's transaction; a `{ ok: false }`
 * result must then be turned into a rollback (`okOrAbort`).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   triggerKey: string;
 *   entityType: string;
 *   entityId: string;
 *   requisitionId?: string | null;
 *   procurementPlanId?: string | null;
 *   budgetId?: string | null;
 *   procurementId?: string | null;
 *   departmentId?: string | null;
 *   entityTitle?: string | null;
 *   actorOrgUserId?: string | null;
 *   actorRoleName?: string | null;
 *   actorDepartmentId?: string | null;
 * }} opts
 */
export async function startWorkflowFromTrigger(prisma, opts) {
  // Inside a caller's transaction the caller runs `prepareWorkflowTriggers` first.
  if (!isTxClient(prisma)) await prepareWorkflowTriggers(prisma, opts.projectId);

  const adoption = await findActiveProcessForTrigger(prisma, opts.projectId, opts.triggerKey);
  if (!adoption) {
    const binding = ENGINE_PROCESS_BINDINGS.find((b) => b.triggerKey === opts.triggerKey);
    const label =
      binding?.label?.replace(/\s+started$/i, "")?.replace(/\s+submitted$/i, "") ||
      (opts.triggerKey === WORKFLOW_TRIGGERS.BUDGET_SUBMITTED
        ? "Budgeting"
        : opts.triggerKey === WORKFLOW_TRIGGERS.PLANNING_SUBMITTED
          ? "Procurement Planning"
          : opts.triggerKey === WORKFLOW_TRIGGERS.EMERGENCY_PLANNING_SUBMITTED
            ? "Emergency Planning"
            : opts.triggerKey === WORKFLOW_TRIGGERS.MICRO_PROCUREMENT_STARTED
              ? "Micro Procurement"
              : opts.triggerKey === WORKFLOW_TRIGGERS.DIRECT_PROCUREMENT_STARTED
                ? "Direct Procurement"
                : opts.triggerKey === WORKFLOW_TRIGGERS.QUOTATION_STARTED
                  ? "Quotation"
                  : opts.triggerKey === WORKFLOW_TRIGGERS.OPEN_DOMESTIC_BIDDING_STARTED
                    ? "Open Domestic Bidding"
                    : opts.triggerKey === WORKFLOW_TRIGGERS.OPEN_INTERNATIONAL_BIDDING_STARTED
                      ? "Open International Bidding"
                      : opts.triggerKey === WORKFLOW_TRIGGERS.RESTRICTED_DOMESTIC_BIDDING_STARTED
                        ? "Restricted Domestic Bidding"
                        : opts.triggerKey === WORKFLOW_TRIGGERS.RESTRICTED_INTERNATIONAL_BIDDING_STARTED
                          ? "Restricted International Bidding"
                          : "Procurement Requisition");
    return {
      ok: false,
      error: `The ${label} Process is currently inactive for this organisation. An Organization Administrator must activate it before this procurement can proceed.`,
      code: "WORKFLOW_INACTIVE",
    };
  }

  const flow = adoption.processFlow;
  const frozenResult = await programmeFreezeResult(prisma, opts.projectId, flow);
  if (frozenResult) return frozenResult;
  const firstStep = flow.items[0];
  if (!firstStep) {
    return {
      ok: false,
      error: "The process template has no steps configured.",
      code: "WORKFLOW_MISCONFIGURED",
    };
  }

  if (opts.requisitionId) {
    const open = await prisma.projectOrgWorkflowInstance.findFirst({
      where: {
        projectId: opts.projectId,
        requisitionId: opts.requisitionId,
        status: { in: [OrgWorkflowInstanceStatus.ACTIVE, OrgWorkflowInstanceStatus.IN_PROGRESS] },
      },
      select: { id: true },
    });
    if (open) {
      return {
        ok: false,
        error: "This requisition already has an active workflow. Do not submit twice.",
        code: "DUPLICATE_SUBMISSION",
      };
    }
  }

  if (opts.procurementPlanId) {
    const open = await prisma.projectOrgWorkflowInstance.findFirst({
      where: {
        projectId: opts.projectId,
        procurementPlanId: opts.procurementPlanId,
        status: { in: [OrgWorkflowInstanceStatus.ACTIVE, OrgWorkflowInstanceStatus.IN_PROGRESS] },
      },
      select: { id: true },
    });
    if (open) {
      return {
        ok: false,
        error: "This procurement plan already has an active workflow. Do not submit twice.",
        code: "DUPLICATE_SUBMISSION",
      };
    }
  }

  if (opts.budgetId) {
    const open = await prisma.projectOrgWorkflowInstance.findFirst({
      where: {
        projectId: opts.projectId,
        budgetId: opts.budgetId,
        status: { in: [OrgWorkflowInstanceStatus.ACTIVE, OrgWorkflowInstanceStatus.IN_PROGRESS] },
      },
      select: { id: true },
    });
    if (open) {
      return {
        ok: false,
        error: "This budget already has an active workflow. Do not submit twice.",
        code: "DUPLICATE_SUBMISSION",
      };
    }
  }

  if (opts.procurementId) {
    const open = await prisma.projectOrgWorkflowInstance.findFirst({
      where: {
        projectId: opts.projectId,
        procurementId: opts.procurementId,
        status: { in: [OrgWorkflowInstanceStatus.ACTIVE, OrgWorkflowInstanceStatus.IN_PROGRESS] },
      },
      select: { id: true },
    });
    if (open) {
      return {
        ok: false,
        error: "This procurement already has an active workflow. Do not start it twice.",
        code: "DUPLICATE_SUBMISSION",
      };
    }
  }

  let startIndex = 0;
  if (
    (opts.triggerKey === WORKFLOW_TRIGGERS.REQUISITION_SUBMITTED ||
      opts.triggerKey === WORKFLOW_TRIGGERS.PLANNING_SUBMITTED ||
      opts.triggerKey === WORKFLOW_TRIGGERS.EMERGENCY_PLANNING_SUBMITTED ||
      opts.triggerKey === WORKFLOW_TRIGGERS.BUDGET_SUBMITTED) &&
    firstStep.actionKey === "SUBMIT" &&
    flow.items.length > 1
  ) {
    startIndex = 1;
  }

  const startStep = flow.items[startIndex];
  const isBudget = Boolean(opts.budgetId);
  const isPlan = Boolean(opts.procurementPlanId);
  const isProcurement = Boolean(opts.procurementId) && !opts.budgetId && !opts.procurementPlanId &&
    opts.entityType === "procurement";
  // For method-started procurements, do not fabricate requisition SUBMITTED transitions.
  const submittedStatus = isBudget
    ? OrgBudgetStatus.SUBMITTED
    : isPlan
      ? OrgProcurementPlanStatus.SUBMITTED
      : isProcurement
        ? null
        : OrgRequisitionStatus.SUBMITTED;
  const draftStatus = isBudget
    ? OrgBudgetStatus.DRAFT
    : isPlan
      ? OrgProcurementPlanStatus.DRAFT
      : isProcurement
        ? null
        : OrgRequisitionStatus.DRAFT;

  let result;
  try {
    result = await runInTx(prisma, async (tx) => {
      const instance = await tx.projectOrgWorkflowInstance.create({
        data: {
          projectId: opts.projectId,
          processFlowId: flow.id,
          entityType: opts.entityType,
          entityId: opts.entityId,
          requisitionId: opts.requisitionId || null,
          procurementPlanId: opts.procurementPlanId || null,
          budgetId: opts.budgetId || null,
          procurementId: opts.procurementId || null,
          triggerKey: opts.triggerKey,
          status: OrgWorkflowInstanceStatus.IN_PROGRESS,
          currentStepNumber: startStep.stepNumber,
        },
      });

      if (opts.actorOrgUserId && startIndex > 0 && draftStatus != null && submittedStatus != null) {
        await tx.projectOrgWorkflowAction.create({
          data: {
            projectId: opts.projectId,
            instanceId: instance.id,
            actorOrgUserId: opts.actorOrgUserId,
            actorRoleName: opts.actorRoleName || null,
            decision: OrgWorkflowDecision.SUBMIT,
            comment: "Submitted for review.",
            previousStatus: draftStatus,
            newStatus: submittedStatus,
            metadata: {
              departmentId: opts.actorDepartmentId || opts.departmentId || null,
            },
          },
        });
      }

      const taskResult = await createTasksForStep(tx, {
        projectId: opts.projectId,
        instanceId: instance.id,
        step: startStep,
        departmentId: opts.departmentId || null,
        entityTitle: opts.entityTitle || null,
      });

      if ((taskResult.eligibleCount || 0) === 0) {
        const missingRole = taskResult.roleName || startStep.projectOrgRole?.name || "reviewer";
        const err = new Error(
          `No organisation users with role “${missingRole}” are available for the first review step. Create or assign that role, then submit again.`,
        );
        // @ts-ignore
        err.code = "NO_ELIGIBLE_ASSIGNEES";
        throw err;
      }

      return { instance, tasks: taskResult.tasks };
    });
  } catch (e) {
    if (e?.code === "NO_ELIGIBLE_ASSIGNEES") {
      return { ok: false, error: e.message, code: "NO_ELIGIBLE_ASSIGNEES" };
    }
    throw e;
  }

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_WORKFLOW_STARTED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      instanceId: result.instance.id,
      triggerKey: opts.triggerKey,
      processName: flow.name,
      entityType: opts.entityType,
      entityId: opts.entityId,
      actorOrgUserId: opts.actorOrgUserId || null,
      actorRoleName: opts.actorRoleName || null,
      departmentId: opts.departmentId || null,
      tasksCreated: result.tasks.length,
    },
  });

  return {
    ok: true,
    instance: result.instance,
    tasks: result.tasks,
    processName: flow.name,
  };
}

/**
 * Calculate funding availability for a budget line.
 * @param {{ approvedAmount: any; committedAmount: any }} line
 * @param {number|string|import("@prisma/client").Prisma.Decimal} requested
 */
export function computeBudgetAvailability(line, requested) {
  const approved = Number(line?.approvedAmount ?? 0);
  const committed = Number(line?.committedAmount ?? 0);
  const requestedAmount = Number(requested ?? 0);
  const available = approved - committed;
  const projected = available - requestedAmount;
  return {
    approvedAmount: approved,
    committedAmount: committed,
    availableBalance: available,
    requestedAmount,
    projectedBalance: projected,
    sufficient: projected >= -0.009,
  };
}

/**
 * Who may act on a workflow task — run BEFORE any business write tied to the task.
 * The actor must belong to the task's project, the task must be PENDING, and either be assigned
 * to the actor or (unassigned) require a role the actor holds. Committee tasks need a live seat
 * on the acting committee.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ taskId: string; actorOrgUserId: string; actorRoleName?: string | null; projectId?: string | null; committeeId?: string | null }} opts
 * @returns {Promise<{ ok: true; task: { id: string; projectId: string; requiredRoleName: string | null; assigneeOrgUserId: string | null } } | { ok: false; error: string; status: number; code?: string }>}
 */
export async function checkWorkflowTaskActor(prisma, opts) {
  const notAvailable = { ok: false, error: "Task is not available.", status: 404 };
  if (!opts.taskId || !opts.actorOrgUserId) return notAvailable;
  const [task, actor] = await Promise.all([
    prisma.projectOrgWorkflowTask.findUnique({
      where: { id: opts.taskId },
      select: {
        id: true,
        projectId: true,
        status: true,
        requiredRoleName: true,
        assigneeOrgUserId: true,
        instance: {
          select: { processFlow: { select: { code: true, triggerKey: true, name: true } } },
        },
      },
    }),
    prisma.projectOrgUser.findUnique({
      where: { id: opts.actorOrgUserId },
      select: { projectId: true },
    }),
  ]);
  if (!task || !actor || actor.projectId !== task.projectId) return notAvailable;
  if (opts.projectId && opts.projectId !== task.projectId) return notAvailable;
  const frozen = await programmeFreezeResult(prisma, task.projectId, task.instance?.processFlow);
  if (frozen) return frozen;
  if (task.status !== OrgWorkflowTaskStatus.PENDING) {
    return {
      ok: false,
      error: "This task has already been completed.",
      code: "TASK_ALREADY_COMPLETED",
      status: 409,
    };
  }
  const committeeType = committeeTypeForWorkflowRole(task.requiredRoleName);
  if (committeeType) {
    if (!opts.committeeId) {
      return {
        ok: false,
        error: `This is ${task.requiredRoleName} work. Switch to the ${task.requiredRoleName} (account menu) before acting on it.`,
        code: "COMMITTEE_MODE_REQUIRED",
        status: 403,
      };
    }
    const { requireCommitteeMembership } = await import("@/lib/projects/committee-context");
    const seat = await requireCommitteeMembership(prisma, {
      projectId: task.projectId,
      orgUserId: opts.actorOrgUserId,
      committeeId: opts.committeeId,
      committeeType,
    });
    if (!seat.ok) return { ok: false, error: seat.error, status: seat.status || 403 };
  }
  if (task.assigneeOrgUserId) {
    if (task.assigneeOrgUserId !== opts.actorOrgUserId) {
      return { ok: false, error: "You are not assigned to this task.", status: 403 };
    }
  } else if (!committeeType) {
    const role = String(opts.actorRoleName || "");
    const allowed = task.requiredRoleName ? expandOrgRoleNames(task.requiredRoleName) : [];
    if (!role || (!allowed.includes(role) && task.requiredRoleName !== role)) {
      return { ok: false, error: "Your active organisation role cannot complete this task.", status: 403 };
    }
  }
  return { ok: true, task };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   taskId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   actorDepartmentId?: string | null;
 *   decision: import("@prisma/client").OrgWorkflowDecision;
 *   comment?: string | null;
 *   committeeId?: string | null;
 *   committeeRole?: string | null;
 *   metadata?: object | null;
 *   returnToStep?: RegExp | null;
 * }} opts `returnToStep` sends a RETURN back to the latest earlier step whose description matches.
 */
export async function completeWorkflowTask(prisma, opts) {
  const actorCheck = await checkWorkflowTaskActor(prisma, opts);
  if (!actorCheck.ok) return actorCheck;
  const task = await prisma.projectOrgWorkflowTask.findUnique({
    where: { id: opts.taskId },
    include: {
      assignee: { select: { id: true, departmentId: true } },
      processFlowItem: { select: { id: true, actionKey: true, taskDescription: true } },
      instance: {
        include: {
          processFlow: {
            include: {
              items: {
                orderBy: { stepNumber: "asc" },
                include: { projectOrgRole: { select: { id: true, name: true } } },
              },
            },
          },
          requisition: {
            include: {
              budgetLine: true,
              procurementPlanItem: true,
              items: true,
              requester: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          procurementPlan: {
            include: {
              department: { select: { id: true, name: true } },
              createdBy: { select: { id: true } },
              items: true,
              financialYear: { select: { id: true, label: true } },
            },
          },
          budget: {
            include: {
              department: { select: { id: true, name: true } },
              createdBy: { select: { id: true } },
              lines: true,
              financialYear: { select: { id: true, label: true } },
            },
          },
          procurement: {
            include: {
              department: { select: { id: true, name: true } },
              requisition: {
                include: {
                  budgetLine: true,
                  procurementPlanItem: true,
                  items: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!task) {
    return { ok: false, error: "Task is not available.", status: 404 };
  }
  if (task.status !== OrgWorkflowTaskStatus.PENDING) {
    return {
      ok: false,
      error: "This task has already been completed.",
      code: "TASK_ALREADY_COMPLETED",
      status: 409,
    };
  }
  if (task.assigneeOrgUserId && task.assigneeOrgUserId !== opts.actorOrgUserId) {
    return { ok: false, error: "You are not assigned to this task.", status: 403 };
  }

  /** @type {{ id: string; name: string; committeeType: string } | null} */
  let actingCommittee = null;
  /** @type {string | null} */
  let actingCommitteeRole = opts.committeeRole || null;

  const taskCommitteeType = committeeTypeForWorkflowRole(task.requiredRoleName);
  if (taskCommitteeType) {
    if (!opts.committeeId) {
      return {
        ok: false,
        error: `This is ${task.requiredRoleName} work. Switch to the ${task.requiredRoleName} (account menu) before acting on it.`,
        code: "COMMITTEE_MODE_REQUIRED",
        status: 403,
      };
    }
    const { requireCommitteeMembership } = await import("@/lib/projects/committee-context");
    const seat = await requireCommitteeMembership(prisma, {
      projectId: task.projectId,
      orgUserId: opts.actorOrgUserId,
      committeeId: opts.committeeId,
      committeeType: taskCommitteeType,
    });
    if (!seat.ok) {
      return {
        ok: false,
        error:
          seat.error ||
          `Switch to the ${task.requiredRoleName} (account menu) before acting on it.`,
        status: seat.status || 403,
      };
    }
    actingCommittee = seat.committee;
    actingCommitteeRole = seat.committeeRole || actingCommitteeRole;
  } else if (task.requiredRoleName && opts.actorRoleName) {
    const allowed = expandOrgRoleNames(task.requiredRoleName);
    if (!allowed.includes(opts.actorRoleName) && task.requiredRoleName !== opts.actorRoleName) {
      return {
        ok: false,
        error: "Your active organisation role cannot complete this task.",
        status: 403,
      };
    }
  }

  const entityDepartmentId =
    task.instance.requisition?.departmentId ||
    task.instance.procurementPlan?.departmentId ||
    task.instance.budget?.departmentId ||
    task.instance.procurement?.departmentId ||
    null;

  if (
    DEPARTMENT_SCOPED_ROLES.has(task.requiredRoleName) &&
    entityDepartmentId &&
    opts.actorDepartmentId &&
    opts.actorDepartmentId !== entityDepartmentId
  ) {
    return {
      ok: false,
      error: "You can only act on records for your own department.",
      status: 403,
    };
  }

  const instance = task.instance;
  const stepActionKey = String(task.processFlowItem?.actionKey || "").trim().toUpperCase();
  let decision = opts.decision;
  // Allow Approve on COMPLETE steps (PDU consolidation) and Complete on APPROVE steps.
  if (
    stepActionKey === "SUBMIT" &&
    (decision === OrgWorkflowDecision.APPROVE || decision === OrgWorkflowDecision.COMPLETE)
  ) {
    // First step of a process (Raise/Prepare) is always a SUBMIT, whichever
    // positive decision alias the client sent.
    decision = OrgWorkflowDecision.SUBMIT;
  } else if (stepActionKey === "COMPLETE" && decision === OrgWorkflowDecision.APPROVE) {
    decision = OrgWorkflowDecision.COMPLETE;
  } else if (stepActionKey === "APPROVE" && decision === OrgWorkflowDecision.COMPLETE) {
    decision = OrgWorkflowDecision.APPROVE;
  } else if (stepActionKey === "VERIFY" && decision === OrgWorkflowDecision.APPROVE) {
    decision = OrgWorkflowDecision.VERIFY;
  }

  const needsComment =
    decision === OrgWorkflowDecision.RETURN ||
    decision === OrgWorkflowDecision.REJECT ||
    decision === OrgWorkflowDecision.FLAG_EXCEPTION;
  if (needsComment && !String(opts.comment || "").trim()) {
    return {
      ok: false,
      error: "A comment is required for this decision.",
      status: 400,
      fieldErrors: { comment: "Enter a meaningful comment." },
    };
  }

  // Funding verification gate
  if (
    decision === OrgWorkflowDecision.VERIFY &&
    /funding/i.test(task.title || "") &&
    instance.requisition?.budgetLine
  ) {
    const funding = computeBudgetAvailability(
      instance.requisition.budgetLine,
      instance.requisition.estimatedTotalValue,
    );
    if (!funding.sufficient) {
      return {
        ok: false,
        error: "Insufficient available budget for this requisition.",
        code: "INSUFFICIENT_FUNDS",
        status: 400,
        funding,
        fieldErrors: {
          comment: "Return or flag an exception — available balance is insufficient.",
        },
      };
    }
  }

  // Plan verification soft-check (RETURN/FLAG still allowed)
  if (
    decision === OrgWorkflowDecision.VERIFY &&
    /plan/i.test(task.title || "") &&
    instance.requisition?.procurementPlanItem
  ) {
    const planItem = instance.requisition.procurementPlanItem;
    const plannedQty = Number(planItem.quantity);
    const plannedValue = Number(planItem.estimatedTotal);
    const reqQty = (instance.requisition.items || []).reduce(
      (sum, i) => sum + Number(i.quantity || 0),
      0,
    );
    const reqValue = Number(instance.requisition.estimatedTotalValue);
    if (reqValue > plannedValue + 0.009 || reqQty > plannedQty + 0.009) {
      return {
        ok: false,
        error: "Requisition exceeds the planned quantity or value. Return or flag an exception.",
        code: "PLAN_EXCEEDED",
        status: 400,
      };
    }
  }

  const previousStatus =
    instance.requisition?.status ||
    instance.procurementPlan?.status ||
    instance.budget?.status ||
    instance.procurement?.status ||
    null;
  let newReqStatus = previousStatus;
  let newPlanStatus = previousStatus;
  let newBudgetStatus = previousStatus;
  let newProcurementStatus = previousStatus;

  // Return goes back one step (record status unchanged) after the Accounting Officer's
  // approval of a requisition, and on every procurement step (documents, reports, award).
  const procurementOnly = Boolean(instance.procurement) && !instance.requisition;
  const returnToPreviousStep =
    decision === OrgWorkflowDecision.RETURN &&
    ((Boolean(instance.requisition) && previousStatus === OrgRequisitionStatus.APPROVED) || procurementOnly);
  const rejectAfterApproval =
    Boolean(instance.requisition) &&
    decision === OrgWorkflowDecision.REJECT &&
    previousStatus === OrgRequisitionStatus.APPROVED;

  if (instance.requisition) {
    if (returnToPreviousStep) {
      newReqStatus = OrgRequisitionStatus.APPROVED;
    } else if (decision === OrgWorkflowDecision.RETURN) {
      newReqStatus = OrgRequisitionStatus.RETURNED;
    } else if (decision === OrgWorkflowDecision.REJECT) {
      newReqStatus = OrgRequisitionStatus.REJECTED;
    } else if (
      decision === OrgWorkflowDecision.APPROVE &&
      task.requiredRoleName === "Accounting Officer"
    ) {
      newReqStatus = OrgRequisitionStatus.APPROVED;
    } else if (
      decision !== OrgWorkflowDecision.SELECT_METHOD &&
      previousStatus !== OrgRequisitionStatus.APPROVED
    ) {
      // Post-approval steps (Form 5 Part II, Contracts Committee method approval) keep APPROVED.
      newReqStatus = OrgRequisitionStatus.UNDER_REVIEW;
    }
  }

  if (instance.procurementPlan) {
    if (decision === OrgWorkflowDecision.RETURN) {
      newPlanStatus = OrgProcurementPlanStatus.RETURNED;
    } else if (decision === OrgWorkflowDecision.REJECT) {
      newPlanStatus = OrgProcurementPlanStatus.REJECTED;
    } else if (
      (decision === OrgWorkflowDecision.APPROVE ||
        decision === OrgWorkflowDecision.COMPLETE) &&
      task.requiredRoleName === "Accounting Officer"
    ) {
      newPlanStatus = OrgProcurementPlanStatus.APPROVED;
    } else if (
      decision === OrgWorkflowDecision.APPROVE ||
      decision === OrgWorkflowDecision.COMPLETE ||
      decision === OrgWorkflowDecision.VERIFY
    ) {
      newPlanStatus = OrgProcurementPlanStatus.UNDER_REVIEW;
    }
  }

  if (instance.budget) {
    if (decision === OrgWorkflowDecision.RETURN) {
      newBudgetStatus = OrgBudgetStatus.RETURNED;
    } else if (decision === OrgWorkflowDecision.REJECT) {
      newBudgetStatus = OrgBudgetStatus.REJECTED;
    } else if (
      decision === OrgWorkflowDecision.APPROVE &&
      task.requiredRoleName === "Accounting Officer"
    ) {
      newBudgetStatus = OrgBudgetStatus.APPROVED;
    } else if (
      decision === OrgWorkflowDecision.APPROVE ||
      decision === OrgWorkflowDecision.COMPLETE ||
      decision === OrgWorkflowDecision.VERIFY
    ) {
      newBudgetStatus = OrgBudgetStatus.UNDER_REVIEW;
    }
  }

  if (procurementOnly && decision === OrgWorkflowDecision.REJECT) {
    newProcurementStatus = OrgProcurementStatus.REJECTED;
  }

  const newEntityStatus = instance.budget
    ? newBudgetStatus
    : instance.procurementPlan
      ? newPlanStatus
      : instance.procurement && !instance.requisition
        ? newProcurementStatus
        : newReqStatus;

  try {
    const outcome = await runInTx(prisma, async (tx) => {
      const claimStatus =
        decision === OrgWorkflowDecision.RETURN
          ? OrgWorkflowTaskStatus.RETURNED
          : decision === OrgWorkflowDecision.REJECT
            ? OrgWorkflowTaskStatus.REJECTED
            : OrgWorkflowTaskStatus.COMPLETED;

      const claimed = await tx.projectOrgWorkflowTask.updateMany({
        where: {
          id: task.id,
          status: OrgWorkflowTaskStatus.PENDING,
          assigneeOrgUserId: opts.actorOrgUserId,
        },
        data: {
          status: claimStatus,
          completedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        const err = new Error("TASK_CLAIM_FAILED");
        // @ts-ignore
        err.code = "TASK_CLAIM_FAILED";
        throw err;
      }

      await tx.projectOrgWorkflowTask.updateMany({
        where: {
          instanceId: instance.id,
          stepNumber: task.stepNumber,
          status: OrgWorkflowTaskStatus.PENDING,
          id: { not: task.id },
        },
        data: { status: OrgWorkflowTaskStatus.CANCELLED },
      });

      if (instance.requisition) {
        const becameApproved =
          newReqStatus === OrgRequisitionStatus.APPROVED &&
          previousStatus !== OrgRequisitionStatus.APPROVED;
        await tx.projectOrgRequisition.update({
          where: { id: instance.requisition.id },
          data: {
            status: newReqStatus,
            ...(becameApproved
              ? {
                  approvedAt: new Date(),
                  approvedByOrgUserId: opts.actorOrgUserId,
                }
              : {}),
          },
        });

        // Commit budget once, on the Accounting Officer's approval (later steps keep APPROVED).
        if (becameApproved && instance.requisition.budgetLineId) {
          const line = await tx.projectOrgBudgetLine.findUnique({
            where: { id: instance.requisition.budgetLineId },
          });
          if (line) {
            const funding = computeBudgetAvailability(
              line,
              instance.requisition.estimatedTotalValue,
            );
            if (!funding.sufficient) {
              const err = new Error("INSUFFICIENT_FUNDS");
              // @ts-ignore
              err.code = "INSUFFICIENT_FUNDS";
              throw err;
            }
            await tx.projectOrgBudgetLine.update({
              where: { id: line.id },
              data: {
                committedAmount: new Prisma.Decimal(
                  (funding.committedAmount + funding.requestedAmount).toFixed(2),
                ),
              },
            });
          }
        }

        if (rejectAfterApproval && instance.requisition.budgetLineId) {
          const line = await tx.projectOrgBudgetLine.findUnique({
            where: { id: instance.requisition.budgetLineId },
            select: { id: true, committedAmount: true },
          });
          if (line) {
            const released = Math.max(
              0,
              Number(line.committedAmount || 0) - Number(instance.requisition.estimatedTotalValue || 0),
            );
            await tx.projectOrgBudgetLine.update({
              where: { id: line.id },
              data: { committedAmount: new Prisma.Decimal(released.toFixed(2)) },
            });
          }
        }
      }

      if (instance.procurementPlan) {
        await tx.projectOrgProcurementPlan.update({
          where: { id: instance.procurementPlan.id },
          data: {
            status: newPlanStatus,
            ...(newPlanStatus === OrgProcurementPlanStatus.APPROVED
              ? {
                  approvedAt: new Date(),
                  approvedByOrgUserId: opts.actorOrgUserId,
                }
              : {}),
          },
        });
      }

      if (instance.budget) {
        await tx.projectOrgBudget.update({
          where: { id: instance.budget.id },
          data: {
            status: newBudgetStatus,
            ...(newBudgetStatus === OrgBudgetStatus.APPROVED
              ? {
                  approvedAt: new Date(),
                  approvedByOrgUserId: opts.actorOrgUserId,
                }
              : {}),
          },
        });
      }

      if (
        instance.procurement &&
        !instance.requisition &&
        newProcurementStatus !== previousStatus
      ) {
        await tx.projectOrgProcurement.update({
          where: { id: instance.procurement.id },
          data: { status: newProcurementStatus },
        });
      }

      await tx.projectOrgWorkflowAction.create({
        data: {
          projectId: task.projectId,
          instanceId: instance.id,
          taskId: task.id,
          actorOrgUserId: opts.actorOrgUserId,
          actorRoleName: opts.actorRoleName,
          committeeId: actingCommittee?.id || opts.committeeId || null,
          committeeRole: actingCommitteeRole || opts.committeeRole || null,
          decision,
          comment: opts.comment?.trim() || null,
          previousStatus,
          newStatus: newEntityStatus,
          metadata: {
            ...(opts.metadata || {}),
            departmentId: opts.actorDepartmentId || null,
            stepNumber: task.stepNumber,
            taskTitle: task.title,
          },
        },
      });

      const earlierSteps = instance.processFlow.items.filter((i) => i.stepNumber < task.stepNumber);
      const targetStep =
        opts.returnToStep instanceof RegExp
          ? earlierSteps.filter((i) => opts.returnToStep.test(String(i.taskDescription || ""))).pop() || null
          : null;
      const previousStep = returnToPreviousStep ? targetStep || earlierSteps.pop() || null : null;

      if (returnToPreviousStep && !previousStep && procurementOnly) {
        const err = new Error("This is the first step; there is nothing to return to.");
        // @ts-ignore
        err.code = "NO_PREVIOUS_STEP";
        throw err;
      }

      if (previousStep) {
        await tx.projectOrgWorkflowInstance.update({
          where: { id: instance.id },
          data: { currentStepNumber: previousStep.stepNumber },
        });
        const reopened = await createTasksForStep(tx, {
          projectId: task.projectId,
          instanceId: instance.id,
          step: previousStep,
          departmentId: instance.requisition?.departmentId || instance.procurement?.departmentId || null,
          entityTitle:
            instance.requisition?.title ||
            (instance.procurement
              ? `${instance.procurement.procurementNumber}: ${instance.procurement.title}`
              : null),
        });
        if ((reopened.eligibleCount || 0) === 0) {
          const missingRole = reopened.roleName || previousStep.projectOrgRole?.name || "previous step";
          const err = new Error(
            `No organisation users with role “${missingRole}” are available to receive the returned task.`,
          );
          // @ts-ignore
          err.code = "NO_ELIGIBLE_ASSIGNEES";
          throw err;
        }
        return { advanced: false, completed: false, nextStep: previousStep, tasks: reopened.tasks || [] };
      }

      if (
        decision === OrgWorkflowDecision.RETURN ||
        decision === OrgWorkflowDecision.REJECT
      ) {
        await tx.projectOrgWorkflowInstance.update({
          where: { id: instance.id },
          data: {
            status:
              decision === OrgWorkflowDecision.REJECT
                ? OrgWorkflowInstanceStatus.CANCELLED
                : OrgWorkflowInstanceStatus.SUSPENDED,
            completedAt: decision === OrgWorkflowDecision.REJECT ? new Date() : null,
          },
        });

        if (decision === OrgWorkflowDecision.RETURN) {
          const correcteeId =
            instance.requisition?.requesterOrgUserId ||
            instance.procurementPlan?.createdByOrgUserId ||
            instance.budget?.createdByOrgUserId ||
            null;
          if (correcteeId) {
            const correctionTitle = instance.budget
              ? "Correct and resubmit budget"
              : instance.procurementPlan
                ? "Correct and resubmit procurement plan"
                : "Correct and resubmit requisition";
            await tx.projectOrgWorkflowTask.create({
              data: {
                projectId: task.projectId,
                instanceId: instance.id,
                processFlowItemId: null,
                stepNumber: 0,
                title: correctionTitle,
                requiredRoleName: "User Department Officer",
                assigneeOrgUserId: correcteeId,
                status: OrgWorkflowTaskStatus.PENDING,
              },
            });
            const correctee = await tx.projectOrgUser.findUnique({
              where: { id: correcteeId },
              select: { id: true, linkedUserId: true },
            });
            if (correctee) {
              await notifyOrgUsers(tx, {
                projectId: task.projectId,
                recipients: [correctee],
                type: OrgNotificationType.WORKFLOW_RETURNED,
                title: "Returned for correction",
                body: `${correctionTitle}. ${opts.actorRoleName || "Reviewer"}: ${String(opts.comment || "").trim() || "Please correct and resubmit."}`,
                linkUrl: `/projects/${task.projectId}/tasks`,
                relatedEntityType: instance.entityType,
                relatedEntityId: instance.entityId,
              });
            }
          }
        } else if (decision === OrgWorkflowDecision.REJECT) {
          const creatorId =
            instance.requisition?.requesterOrgUserId ||
            instance.procurementPlan?.createdByOrgUserId ||
            instance.budget?.createdByOrgUserId ||
            instance.procurement?.officerOrgUserId ||
            null;
          if (creatorId) {
            const creator = await tx.projectOrgUser.findUnique({
              where: { id: creatorId },
              select: { id: true, linkedUserId: true },
            });
            if (creator) {
              await notifyOrgUsers(tx, {
                projectId: task.projectId,
                recipients: [creator],
                type: OrgNotificationType.WORKFLOW_REJECTED,
                title: "Request rejected",
                body: `${task.title} was rejected by ${opts.actorRoleName || "reviewer"}. ${String(opts.comment || "").trim() || ""}`.trim(),
                linkUrl: `/projects/${task.projectId}/tasks`,
                relatedEntityType: instance.entityType,
                relatedEntityId: instance.entityId,
              });
            }
          }
        }

        return { advanced: false, completed: false, nextStep: null, tasks: [] };
      }

      const items = instance.processFlow.items;
      const idx = items.findIndex((i) => i.stepNumber === task.stepNumber);
      const nextStep = idx >= 0 ? items[idx + 1] : items.find((i) => i.stepNumber > task.stepNumber) || null;

      if (!nextStep) {
        await tx.projectOrgWorkflowInstance.update({
          where: { id: instance.id },
          data: {
            status: OrgWorkflowInstanceStatus.COMPLETED,
            completedAt: new Date(),
            currentStepNumber: task.stepNumber,
          },
        });
        return { advanced: false, completed: true, nextStep: null, tasks: [] };
      }

      await tx.projectOrgWorkflowInstance.update({
        where: { id: instance.id },
        data: { currentStepNumber: nextStep.stepNumber },
      });

      const created = await createTasksForStep(tx, {
        projectId: task.projectId,
        instanceId: instance.id,
        step: nextStep,
        departmentId:
          instance.requisition?.departmentId ||
          instance.procurementPlan?.departmentId ||
          instance.budget?.departmentId ||
          instance.procurement?.departmentId ||
          null,
        entityTitle:
          instance.budget?.title ||
          instance.procurementPlan?.title ||
          instance.requisition?.title ||
          (instance.procurement
            ? `${instance.procurement.procurementNumber}: ${instance.procurement.title}`
            : null),
      });

      if ((created.eligibleCount || 0) === 0) {
        const missingRole = created.roleName || nextStep.projectOrgRole?.name || "next reviewer";
        const err = new Error(
          `No organisation users with role “${missingRole}” are available to receive the next task. Create or assign that role, then try again.`,
        );
        // @ts-ignore
        err.code = "NO_ELIGIBLE_ASSIGNEES";
        // @ts-ignore
        err.missingRole = missingRole;
        throw err;
      }

      return {
        advanced: true,
        completed: false,
        nextStep: nextStep.taskDescription,
        tasks: created.tasks,
      };
    });

    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ORG_WORKFLOW_TASK_COMPLETED,
      actorUserId: null,
      meta: {
        projectId: task.projectId,
        instanceId: instance.id,
        taskId: task.id,
        decision,
        comment: opts.comment?.trim() || null,
        previousStatus,
        newStatus: newEntityStatus,
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        departmentId: opts.actorDepartmentId || null,
        workflowStep: task.stepNumber,
        taskTitle: task.title,
        requisitionId: instance.requisitionId,
        procurementPlanId: instance.procurementPlanId,
        budgetId: instance.budgetId,
        procurementId: instance.procurementId,
      },
    });

    // Notify record creator on advance / final approval (RETURN/REJECT already notified above).
    if (
      decision !== OrgWorkflowDecision.RETURN &&
      decision !== OrgWorkflowDecision.REJECT
    ) {
      const creatorId =
        instance.requisition?.requesterOrgUserId ||
        instance.procurementPlan?.createdByOrgUserId ||
        instance.budget?.createdByOrgUserId ||
        instance.procurement?.officerOrgUserId ||
        null;
      const budgetJustApproved =
        Boolean(instance.budget) &&
        newBudgetStatus === OrgBudgetStatus.APPROVED &&
        previousStatus !== OrgBudgetStatus.APPROVED;
      const planJustApproved =
        Boolean(instance.procurementPlan) &&
        newPlanStatus === OrgProcurementPlanStatus.APPROVED &&
        previousStatus !== OrgProcurementPlanStatus.APPROVED;
      const reqJustApproved =
        Boolean(instance.requisition) &&
        newReqStatus === OrgRequisitionStatus.APPROVED &&
        previousStatus !== OrgRequisitionStatus.APPROVED;
      const isFinalApprove = budgetJustApproved || planJustApproved || reqJustApproved;

      // Budget/plan final approve: department handoff (My Tasks + notify) covers the creator.
      // Other advances / requisition approve: notify the creator only.
      if (budgetJustApproved || planJustApproved) {
        try {
          if (budgetJustApproved) {
            await createNextProcessHandoff(prisma, {
              projectId: task.projectId,
              instanceId: instance.id,
              departmentId: instance.budget?.departmentId || instance.budget?.department?.id || null,
              recordLabel: instance.budget?.title || "Approved budget",
              kind: "SUBMIT_PLAN",
              excludeOrgUserId: opts.actorOrgUserId,
              includeOrgUserId: creatorId,
              relatedEntityType: "budget",
              relatedEntityId: instance.budget.id,
            });
          } else {
            await createNextProcessHandoff(prisma, {
              projectId: task.projectId,
              instanceId: instance.id,
              departmentId:
                instance.procurementPlan?.departmentId ||
                instance.procurementPlan?.department?.id ||
                null,
              recordLabel: instance.procurementPlan?.title || "Approved plan",
              kind: "SUBMIT_REQUISITION",
              excludeOrgUserId: opts.actorOrgUserId,
              includeOrgUserId: creatorId,
              relatedEntityType: "procurement_plan",
              relatedEntityId: instance.procurementPlan.id,
            });
          }
        } catch {
          // Non-fatal
        }
      } else if (creatorId && creatorId !== opts.actorOrgUserId) {
        try {
          const creator = await prisma.projectOrgUser.findUnique({
            where: { id: creatorId },
            select: { id: true, linkedUserId: true },
          });
          if (creator) {
            await notifyOrgUsers(prisma, {
              projectId: task.projectId,
              recipients: [creator],
              type: isFinalApprove
                ? OrgNotificationType.WORKFLOW_APPROVED
                : OrgNotificationType.WORKFLOW_DECISION,
              title: reqJustApproved ? "Requisition approved" : isFinalApprove ? "Approved" : "Workflow update",
              body: reqJustApproved
                ? `${instance.requisition?.title || "Requisition"} is approved. Procurement method selection is next.`
                : isFinalApprove
                  ? `${task.title} was approved by ${opts.actorRoleName || "Accounting Officer"}.`
                  : `${task.title}: ${opts.actorRoleName || "Reviewer"} recorded ${decision}. Status is now ${newEntityStatus}.`,
              linkUrl: reqJustApproved
                ? `/projects/${task.projectId}/requisitions/${instance.requisition.id}`
                : `/projects/${task.projectId}/tasks`,
              relatedEntityType: instance.entityType,
              relatedEntityId: instance.entityId,
            });
          }
        } catch {
          // Non-fatal
        }
      }
    }

    return {
      ok: true,
      ...outcome,
      requisitionStatus: instance.requisition ? newReqStatus : undefined,
      procurementPlanStatus: instance.procurementPlan ? newPlanStatus : undefined,
      budgetStatus: instance.budget ? newBudgetStatus : undefined,
      procurementStatus:
        instance.procurement && !instance.requisition ? newProcurementStatus : undefined,
    };
  } catch (e) {
    if (e?.code === "TASK_CLAIM_FAILED") {
      return {
        ok: false,
        error: "This task was already completed by another user.",
        code: "TASK_ALREADY_COMPLETED",
        status: 409,
      };
    }
    if (e?.code === "NO_ELIGIBLE_ASSIGNEES") {
      return {
        ok: false,
        error: e.message,
        code: "NO_ELIGIBLE_ASSIGNEES",
        status: 400,
      };
    }
    if (e?.code === "INSUFFICIENT_FUNDS") {
      return {
        ok: false,
        error: "Insufficient available budget at approval time.",
        code: "INSUFFICIENT_FUNDS",
        status: 400,
      };
    }
    if (e?.code === "NO_PREVIOUS_STEP") {
      return { ok: false, error: e.message, code: "NO_PREVIOUS_STEP", status: 400 };
    }
    throw e;
  }
}
