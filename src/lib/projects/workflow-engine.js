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
import { committeeTypeForWorkflowRole } from "@/lib/projects/committee-context";
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
 * Roles that must match the requisition department (or subunit under it).
 */
const DEPARTMENT_SCOPED_ROLES = new Set([
  "User Department Officer",
  "Head User Department",
  "User Department",
  "Head of User Department",
]);

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
        title: "New organisation task",
        body: `${title} — assigned to ${roleName}. Open My Tasks to action.`,
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
        select: { id: true, stepNumber: true },
      },
    },
  });

  let created = 0;
  for (const instance of instances) {
    const step = (instance.processFlow?.items || []).find(
      (i) => i.stepNumber === instance.currentStepNumber,
    );
    if (!step) continue;
    const hasPending = (instance.tasks || []).some((t) => t.stepNumber === step.stepNumber);
    if (hasPending) continue;

    const result = await createTasksForStep(prisma, {
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
    created += result.eligibleCount || 0;
  }
  return { created };
}

/**
 * Start a workflow instance for an entity when its trigger fires.
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
  // Repair legacy catalogue adoptions (name-only rows without triggerKey) before lookup.
  try {
    await ensureBaselineProcessTemplates(prisma);
    await migrateLegacyProcessAdoptions(prisma, { projectId: opts.projectId });
  } catch {
    // Non-fatal — lookup may still succeed if already migrated.
  }

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
              : opts.triggerKey === WORKFLOW_TRIGGERS.QUOTATION_STARTED
                ? "Quotation"
                : opts.triggerKey === WORKFLOW_TRIGGERS.TENDER_STARTED
                  ? "Tender"
                  : "Procurement Requisition");
    return {
      ok: false,
      error: `The ${label} Process is currently inactive for this organisation. An Organization Administrator must activate it before this procurement can proceed.`,
      code: "WORKFLOW_INACTIVE",
    };
  }

  const flow = adoption.processFlow;
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
    result = await prisma.$transaction(async (tx) => {
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
 * }} opts
 */
export async function completeWorkflowTask(prisma, opts) {
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

  if (instance.requisition) {
    if (decision === OrgWorkflowDecision.RETURN) {
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

  if (instance.procurement && !instance.requisition) {
    // Procurement-only instances (Micro/Quotation/Tender) have no RETURNED
    // status of their own — a return/reject on these steps cancels this
    // procurement attempt rather than looping back for correction, since the
    // requisition that spawned it is not re-editable from here.
    if (decision === OrgWorkflowDecision.RETURN) {
      newProcurementStatus = OrgProcurementStatus.CANCELLED;
    } else if (decision === OrgWorkflowDecision.REJECT) {
      newProcurementStatus = OrgProcurementStatus.REJECTED;
    }
  }

  const newEntityStatus = instance.budget
    ? newBudgetStatus
    : instance.procurementPlan
      ? newPlanStatus
      : instance.procurement && !instance.requisition
        ? newProcurementStatus
        : newReqStatus;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
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
      const nextStep = idx >= 0 ? items[idx + 1] : null;

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
      if (creatorId && creatorId !== opts.actorOrgUserId) {
        const isFinalApprove =
          (instance.budget && newBudgetStatus === OrgBudgetStatus.APPROVED) ||
          (instance.procurementPlan &&
            newPlanStatus === OrgProcurementPlanStatus.APPROVED) ||
          (instance.requisition && newReqStatus === OrgRequisitionStatus.APPROVED);
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
              title: isFinalApprove ? "Approved" : "Workflow update",
              body: isFinalApprove
                ? `${task.title} was approved by ${opts.actorRoleName || "Accounting Officer"}.`
                : `${task.title}: ${opts.actorRoleName || "Reviewer"} recorded ${decision}. Status is now ${newEntityStatus}.`,
              linkUrl: `/projects/${task.projectId}/tasks`,
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
    throw e;
  }
}
