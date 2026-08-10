import {
  OrgRequisitionStatus,
  OrgProcurementMethod,
  OrgWorkflowInstanceStatus,
  OrgWorkflowTaskStatus,
  Prisma,
} from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { WORKFLOW_TRIGGERS } from "@/lib/projects/process-catalogue";
import {
  startWorkflowFromTrigger,
  completeWorkflowTask,
  computeBudgetAvailability,
} from "@/lib/projects/workflow-engine";
import { ORG_REF_DOC, nextOrgDocumentReference } from "@/lib/projects/org-reference";

/**
 * @param {unknown} value
 */
function toDecimal(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/\s/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return new Prisma.Decimal(n.toFixed(2));
}

/**
 * Sum quantity/value already consuming a plan item (non-rejected/cancelled).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} planItemId
 * @param {string} [excludeRequisitionId]
 */
export async function computePlanItemConsumption(prisma, planItemId, excludeRequisitionId) {
  const rows = await prisma.projectOrgRequisition.findMany({
    where: {
      procurementPlanItemId: planItemId,
      status: {
        notIn: [OrgRequisitionStatus.REJECTED, OrgRequisitionStatus.CANCELLED],
      },
      ...(excludeRequisitionId ? { id: { not: excludeRequisitionId } } : {}),
    },
    select: {
      estimatedTotalValue: true,
      items: { select: { quantity: true } },
    },
  });
  let qty = 0;
  let value = 0;
  for (const r of rows) {
    value += Number(r.estimatedTotalValue || 0);
    for (const i of r.items || []) qty += Number(i.quantity || 0);
  }
  return { usedQuantity: qty, usedValue: value };
}

/**
 * @param {any} row
 */
export function serializeRequisition(row) {
  const budget = row.budgetLine
    ? (() => {
        const funding = computeBudgetAvailability(row.budgetLine, row.estimatedTotalValue);
        return {
          id: row.budgetLine.id,
          code: row.budgetLine.code,
          name: row.budgetLine.name,
          approvedAmount: funding.approvedAmount.toFixed(2),
          committedAmount: funding.committedAmount.toFixed(2),
          availableBalance: funding.availableBalance.toFixed(2),
          requestedAmount: funding.requestedAmount.toFixed(2),
          projectedBalance: funding.projectedBalance.toFixed(2),
          sufficient: funding.sufficient,
        };
      })()
    : null;

  return {
    id: row.id,
    title: row.title,
    requisitionReference: row.requisitionReference || null,
    category: row.category || null,
    justification: row.justification,
    needDescription: row.needDescription,
    requiredByDate: row.requiredByDate,
    deliveryLocation: row.deliveryLocation || null,
    requestedDeliveryDate: row.requestedDeliveryDate,
    remarks: row.remarks || null,
    estimatedTotalValue: row.estimatedTotalValue?.toString?.() ?? String(row.estimatedTotalValue),
    status: row.status,
    procurementMethod: row.procurementMethod || null,
    submittedAt: row.submittedAt,
    approvedAt: row.approvedAt,
    requester: row.requester
      ? {
          id: row.requester.id,
          firstName: row.requester.firstName,
          lastName: row.requester.lastName,
          displayName: `${row.requester.firstName || ""} ${row.requester.lastName || ""}`.trim(),
        }
      : null,
    approvedBy: row.approvedBy
      ? {
          id: row.approvedBy.id,
          firstName: row.approvedBy.firstName,
          lastName: row.approvedBy.lastName,
          displayName: `${row.approvedBy.firstName || ""} ${row.approvedBy.lastName || ""}`.trim(),
        }
      : null,
    financialYear: row.financialYear
      ? { id: row.financialYear.id, label: row.financialYear.label }
      : null,
    department: row.department
      ? { id: row.department.id, name: row.department.name, code: row.department.code }
      : null,
    procurementPlan: row.procurementPlan
      ? {
          id: row.procurementPlan.id,
          title: row.procurementPlan.title,
          status: row.procurementPlan.status,
        }
      : null,
    procurementPlanItem: row.procurementPlanItem
      ? {
          id: row.procurementPlanItem.id,
          title: row.procurementPlanItem.title,
          quantity: row.procurementPlanItem.quantity?.toString?.(),
          estimatedTotal: row.procurementPlanItem.estimatedTotal?.toString?.(),
          unitOfMeasure: row.procurementPlanItem.unitOfMeasure || null,
        }
      : null,
    budgetLine: budget,
    items: Array.isArray(row.items)
      ? row.items.map((i) => ({
          id: i.id,
          lineNumber: i.lineNumber,
          itemName: i.itemName,
          description: i.description || null,
          specification: i.specification || null,
          quantity: i.quantity?.toString?.() ?? String(i.quantity),
          unitOfMeasure: i.unitOfMeasure,
          estimatedUnitPrice: i.estimatedUnitPrice?.toString?.() ?? String(i.estimatedUnitPrice),
          estimatedTotal: i.estimatedTotal?.toString?.() ?? String(i.estimatedTotal),
        }))
      : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const requisitionInclude = {
  financialYear: { select: { id: true, label: true } },
  department: { select: { id: true, name: true, code: true } },
  procurementPlan: { select: { id: true, title: true, status: true } },
  procurementPlanItem: {
    select: {
      id: true,
      title: true,
      quantity: true,
      estimatedTotal: true,
      unitOfMeasure: true,
    },
  },
  budgetLine: {
    select: {
      id: true,
      code: true,
      name: true,
      approvedAmount: true,
      committedAmount: true,
    },
  },
  requester: { select: { id: true, firstName: true, lastName: true, email: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  items: { orderBy: { lineNumber: "asc" } },
};

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   requesterOrgUserId: string;
 *   departmentId: string;
 *   body: any;
 *   requisitionId?: string | null;
 * }} opts
 */
export async function createOrUpdateRequisitionDraft(prisma, opts) {
  const b = opts.body || {};
  /** @type {Record<string, string>} */
  const fieldErrors = {};

  const title = typeof b.title === "string" ? b.title.trim() : "";
  let requisitionReference =
    typeof b.requisitionReference === "string" ? b.requisitionReference.trim() || null : null;
  const justification = typeof b.justification === "string" ? b.justification.trim() : "";
  const needDescription = typeof b.needDescription === "string" ? b.needDescription.trim() : "";
  const financialYearId = typeof b.financialYearId === "string" ? b.financialYearId.trim() : "";
  const procurementPlanId =
    typeof b.procurementPlanId === "string" ? b.procurementPlanId.trim() : "";
  const procurementPlanItemId =
    typeof b.procurementPlanItemId === "string" ? b.procurementPlanItemId.trim() : "";
  const budgetLineId = typeof b.budgetLineId === "string" ? b.budgetLineId.trim() : "";
  const category = typeof b.category === "string" ? b.category.trim() || null : null;
  const deliveryLocation =
    typeof b.deliveryLocation === "string" ? b.deliveryLocation.trim() || null : null;
  const remarks = typeof b.remarks === "string" ? b.remarks.trim() || null : null;

  if (!title) fieldErrors.title = "Enter a procurement title.";
  if (!justification) fieldErrors.justification = "Enter a justification.";
  if (!needDescription) fieldErrors.needDescription = "Describe the need/requirement.";
  if (!financialYearId) fieldErrors.financialYearId = "Choose a financial year.";
  if (!procurementPlanId) fieldErrors.procurementPlanId = "Choose a procurement plan.";
  if (!procurementPlanItemId) {
    fieldErrors.procurementPlanItemId = "Choose a procurement plan item.";
  }
  if (!budgetLineId) fieldErrors.budgetLineId = "Choose a budget / funding reference.";
  if (!opts.departmentId) fieldErrors.departmentId = "Your account must belong to a department.";
  if (!b.requiredByDate) {
    fieldErrors.requiredByDate = "Choose a required-by date.";
  }

  const itemsIn = Array.isArray(b.items) ? b.items : [];
  if (itemsIn.length === 0) fieldErrors.items = "Add at least one line item.";

  const fy = financialYearId
    ? await prisma.projectOrgFinancialYear.findFirst({
        where: { id: financialYearId, projectId: opts.projectId, isActive: true },
      })
    : null;
  if (financialYearId && !fy) {
    fieldErrors.financialYearId = "Choose an active financial year.";
  } else if (fy) {
    const { isFinancialYearCurrentlyValid } = await import("@/lib/projects/org-financial-years");
    if (!isFinancialYearCurrentlyValid(fy.startDate, fy.endDate)) {
      fieldErrors.financialYearId =
        "Choose an active financial year that covers today's date.";
    }
  }

  const dept = opts.departmentId
    ? await prisma.projectOrgDepartment.findFirst({
        where: { id: opts.departmentId, projectId: opts.projectId },
        select: { id: true, name: true, code: true },
      })
    : null;

  if (!requisitionReference && fy && dept) {
    const existing = await prisma.projectOrgRequisition.findMany({
      where: { projectId: opts.projectId, requisitionReference: { not: null } },
      select: { requisitionReference: true },
    });
    requisitionReference = nextOrgDocumentReference(
      existing.map((r) => r.requisitionReference).filter(Boolean),
      {
        deptCode: dept.code,
        deptName: dept.name,
        docType: ORG_REF_DOC.REQUISITION,
        fyLabel: fy.label,
      },
    );
  }

  if (requisitionReference) {
    const clash = await prisma.projectOrgRequisition.findFirst({
      where: {
        projectId: opts.projectId,
        requisitionReference,
        ...(opts.requisitionId ? { id: { not: opts.requisitionId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      fieldErrors.requisitionReference = "This requisition reference is already in use.";
    }
  }

  const plan = procurementPlanId
    ? await prisma.projectOrgProcurementPlan.findFirst({
        where: {
          id: procurementPlanId,
          projectId: opts.projectId,
          status: "APPROVED",
        },
        include: { items: true },
      })
    : null;
  if (procurementPlanId && !plan) {
    fieldErrors.procurementPlanId = "Choose an approved procurement plan.";
  }

  let planItem = null;
  if (procurementPlanItemId && plan) {
    planItem = plan.items.find((i) => i.id === procurementPlanItemId) || null;
    if (!planItem) fieldErrors.procurementPlanItemId = "Choose a valid plan item.";
  } else if (procurementPlanItemId && !plan) {
    fieldErrors.procurementPlanItemId = "Choose a valid plan item.";
  }

  let budgetLine = null;
  if (budgetLineId) {
    budgetLine = await prisma.projectOrgBudgetLine.findFirst({
      where: {
        id: budgetLineId,
        projectId: opts.projectId,
        isActive: true,
        financialYearId: financialYearId || undefined,
        budget: { status: "APPROVED" },
      },
      include: { budget: { select: { id: true, status: true } } },
    });
    if (!budgetLine) {
      fieldErrors.budgetLineId =
        "Choose a budget line from an APPROVED budget for this financial year.";
    }
  }

  /** @type {any[]} */
  const itemRows = [];
  let total = new Prisma.Decimal(0);
  let totalQty = 0;
  itemsIn.forEach((raw, idx) => {
    const itemName = typeof raw?.itemName === "string" ? raw.itemName.trim() : "";
    const qty = toDecimal(raw?.quantity);
    const unitPrice = toDecimal(raw?.estimatedUnitPrice);
    const uom = typeof raw?.unitOfMeasure === "string" ? raw.unitOfMeasure.trim() : "";
    if (!itemName || !qty || !unitPrice || !uom) return;
    const lineTotal = qty.mul(unitPrice);
    total = total.add(lineTotal);
    totalQty += Number(qty);
    itemRows.push({
      lineNumber: idx + 1,
      itemName,
      description: typeof raw?.description === "string" ? raw.description.trim() || null : null,
      specification: typeof raw?.specification === "string" ? raw.specification.trim() || null : null,
      quantity: qty,
      unitOfMeasure: uom,
      estimatedUnitPrice: unitPrice,
      estimatedTotal: lineTotal,
    });
  });

  if (itemRows.length === 0) {
    fieldErrors.items = "Each item needs name, quantity, unit, and unit price.";
  }

  if (planItem && itemRows.length > 0) {
    const consumption = await computePlanItemConsumption(
      prisma,
      planItem.id,
      opts.requisitionId || undefined,
    );
    const plannedQty = Number(planItem.quantity);
    const plannedValue = Number(planItem.estimatedTotal);
    const remainingQty = plannedQty - consumption.usedQuantity;
    const remainingValue = plannedValue - consumption.usedValue;
    if (totalQty > remainingQty + 0.009) {
      fieldErrors.items = `Requested quantity (${totalQty}) exceeds remaining planned quantity (${remainingQty}).`;
    }
    if (Number(total) > remainingValue + 0.009) {
      fieldErrors.estimatedTotalValue = `Requested value exceeds remaining planned value (${remainingValue.toFixed(2)}).`;
    }
  }

  if (budgetLine && itemRows.length > 0) {
    const funding = computeBudgetAvailability(budgetLine, total);
    if (!funding.sufficient) {
      fieldErrors.budgetLineId = `Insufficient funds. Available ${funding.availableBalance.toFixed(2)}; requested ${funding.requestedAmount.toFixed(2)}.`;
    }
  }

  if (Object.keys(fieldErrors).length) {
    return { ok: false, fieldErrors, error: "Please fix the highlighted fields." };
  }

  const payload = {
    financialYearId,
    departmentId: opts.departmentId,
    procurementPlanId: plan?.id || null,
    procurementPlanItemId: planItem?.id || null,
    budgetLineId: budgetLine?.id || null,
    requisitionReference,
    title,
    category,
    justification,
    needDescription,
    requiredByDate: b.requiredByDate ? new Date(b.requiredByDate) : null,
    deliveryLocation,
    requestedDeliveryDate: b.requestedDeliveryDate ? new Date(b.requestedDeliveryDate) : null,
    remarks,
    estimatedTotalValue: total,
    status: OrgRequisitionStatus.DRAFT,
  };

  let row;
  if (opts.requisitionId) {
    const existing = await prisma.projectOrgRequisition.findFirst({
      where: {
        id: opts.requisitionId,
        projectId: opts.projectId,
        requesterOrgUserId: opts.requesterOrgUserId,
        status: { in: [OrgRequisitionStatus.DRAFT, OrgRequisitionStatus.RETURNED] },
      },
    });
    if (!existing) {
      return { ok: false, error: "Requisition not found or cannot be edited.", status: 404 };
    }
    await prisma.projectOrgRequisitionItem.deleteMany({
      where: { requisitionId: existing.id },
    });
    row = await prisma.projectOrgRequisition.update({
      where: { id: existing.id },
      data: {
        ...payload,
        status: OrgRequisitionStatus.DRAFT,
        items: { create: itemRows },
      },
      include: requisitionInclude,
    });
  } else {
    row = await prisma.projectOrgRequisition.create({
      data: {
        projectId: opts.projectId,
        requesterOrgUserId: opts.requesterOrgUserId,
        ...payload,
        items: { create: itemRows },
      },
      include: requisitionInclude,
    });
  }

  return { ok: true, requisition: serializeRequisition(row) };
}

/** @deprecated use createOrUpdateRequisitionDraft */
export async function createRequisitionDraft(prisma, opts) {
  return createOrUpdateRequisitionDraft(prisma, opts);
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   requisitionId: string;
 *   projectId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   actorDepartmentId?: string | null;
 * }} opts
 */
export async function submitRequisition(prisma, opts) {
  const row = await prisma.projectOrgRequisition.findFirst({
    where: { id: opts.requisitionId, projectId: opts.projectId },
    include: requisitionInclude,
  });
  if (!row) return { ok: false, error: "Requisition not found.", status: 404 };
  if (row.requesterOrgUserId !== opts.actorOrgUserId) {
    return { ok: false, error: "Only the requester can submit this draft.", status: 403 };
  }
  if (![OrgRequisitionStatus.DRAFT, OrgRequisitionStatus.RETURNED].includes(row.status)) {
    return { ok: false, error: "This requisition cannot be submitted.", status: 400 };
  }
  if (!row.procurementPlanId || row.procurementPlan?.status !== "APPROVED") {
    return {
      ok: false,
      error: "An approved procurement plan reference is required before submission.",
      status: 400,
    };
  }
  if (!row.procurementPlanItemId) {
    return {
      ok: false,
      error: "A procurement plan item is required before submission.",
      status: 400,
    };
  }
  if (!row.budgetLineId || !row.budgetLine) {
    return {
      ok: false,
      error: "A budget / funding reference is required before submission.",
      status: 400,
    };
  }

  const funding = computeBudgetAvailability(row.budgetLine, row.estimatedTotalValue);
  if (!funding.sufficient) {
    return {
      ok: false,
      error: `Insufficient available budget (${funding.availableBalance.toFixed(2)}).`,
      code: "INSUFFICIENT_FUNDS",
      status: 400,
      funding,
    };
  }

  // Close prior suspended instances / correction tasks on resubmit
  await prisma.projectOrgWorkflowInstance.updateMany({
    where: {
      requisitionId: row.id,
      status: {
        in: [OrgWorkflowInstanceStatus.SUSPENDED, OrgWorkflowInstanceStatus.IN_PROGRESS],
      },
    },
    data: {
      status: OrgWorkflowInstanceStatus.CANCELLED,
      completedAt: new Date(),
    },
  });
  await prisma.projectOrgWorkflowTask.updateMany({
    where: {
      projectId: opts.projectId,
      status: OrgWorkflowTaskStatus.PENDING,
      instance: { requisitionId: row.id },
    },
    data: { status: OrgWorkflowTaskStatus.CANCELLED },
  });

  const started = await startWorkflowFromTrigger(prisma, {
    projectId: opts.projectId,
    triggerKey: WORKFLOW_TRIGGERS.REQUISITION_SUBMITTED,
    entityType: "requisition",
    entityId: row.id,
    requisitionId: row.id,
    departmentId: row.departmentId,
    entityTitle: row.title,
    actorOrgUserId: opts.actorOrgUserId,
    actorRoleName: opts.actorRoleName,
    actorDepartmentId: opts.actorDepartmentId || row.departmentId,
  });

  if (!started.ok) {
    return {
      ok: false,
      error: started.error,
      code: started.code,
      status: started.code === "NO_ELIGIBLE_ASSIGNEES" ? 400 : 409,
    };
  }

  const updated = await prisma.projectOrgRequisition.update({
    where: { id: row.id },
    data: {
      status: OrgRequisitionStatus.SUBMITTED,
      submittedAt: new Date(),
    },
    include: requisitionInclude,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_REQUISITION_SUBMITTED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      requisitionId: row.id,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      departmentId: row.departmentId,
      instanceId: started.instance.id,
      previousStatus: row.status,
      newStatus: OrgRequisitionStatus.SUBMITTED,
    },
  });

  return {
    ok: true,
    requisition: serializeRequisition(updated),
    workflow: {
      instanceId: started.instance.id,
      processName: started.processName,
      tasksCreated: started.tasks?.length || 0,
    },
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
 *   comment?: string;
 *   procurementMethod?: string | null;
 * }} opts
 */
export async function actOnRequisitionTask(prisma, opts) {
  const methodOk =
    opts.procurementMethod &&
    Object.prototype.hasOwnProperty.call(OrgProcurementMethod, opts.procurementMethod);

  if (opts.decision === "SELECT_METHOD" && !methodOk) {
    return {
      ok: false,
      error: "Choose MICRO, QUOTATION, or TENDER.",
      status: 400,
      fieldErrors: { procurementMethod: "Choose a procurement method." },
    };
  }

  if (opts.decision === "SELECT_METHOD" && methodOk) {
    const { createProcurementFromApprovedRequisition } = await import(
      "@/lib/projects/procurements"
    );

    const taskPreview = await prisma.projectOrgWorkflowTask.findUnique({
      where: { id: opts.taskId },
      select: {
        status: true,
        assigneeOrgUserId: true,
        instance: { select: { id: true, requisitionId: true, projectId: true } },
      },
    });
    if (!taskPreview?.instance?.requisitionId) {
      return {
        ok: false,
        error: "This method-selection task is not linked to a requisition.",
        status: 400,
      };
    }
    if (taskPreview.status !== "PENDING") {
      return { ok: false, error: "This task is no longer pending.", status: 400 };
    }

    const created = await createProcurementFromApprovedRequisition(prisma, {
      projectId: taskPreview.instance.projectId,
      requisitionId: taskPreview.instance.requisitionId,
      procurementMethod: opts.procurementMethod,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      actorDepartmentId: opts.actorDepartmentId || null,
    });
    if (!created.ok) {
      return created;
    }

    const metadata = {
      procurementMethod: opts.procurementMethod,
      nextProcessQueued: created.nextProcessQueued,
      nextProcessStarted: true,
      procurementId: created.procurement?.id || null,
      procurementNumber: created.procurement?.procurementNumber || null,
    };

    const result = await completeWorkflowTask(prisma, {
      taskId: opts.taskId,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      actorDepartmentId: opts.actorDepartmentId || null,
      decision: opts.decision,
      comment: opts.comment,
      metadata,
    });

    if (!result.ok) {
      // Method workflow already started; surface the task completion error with context.
      return {
        ...result,
        procurement: created.procurement,
        nextProcessQueued: created.nextProcessQueued,
        nextProcessStarted: true,
        warning:
          "Procurement was created and the method workflow started, but the method-selection task could not be closed. Open My Tasks or the procurement detail to continue.",
      };
    }

    if (taskPreview.instance.id) {
      await prisma.projectOrgWorkflowAction.updateMany({
        where: {
          taskId: opts.taskId,
          decision: "SELECT_METHOD",
        },
        data: { metadata },
      });
    }

    return {
      ...result,
      procurement: created.procurement,
      nextProcessQueued: created.nextProcessQueued,
      nextProcessStarted: true,
      workflow: created.workflow,
    };
  }

  const result = await completeWorkflowTask(prisma, {
    taskId: opts.taskId,
    actorOrgUserId: opts.actorOrgUserId,
    actorRoleName: opts.actorRoleName,
    actorDepartmentId: opts.actorDepartmentId || null,
    decision: opts.decision,
    comment: opts.comment,
    metadata: null,
  });

  return result;
}

/**
 * Build plan/budget evidence for a requisition (for verification tasks).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {any} requisition
 */
export async function buildRequisitionVerificationEvidence(prisma, requisition) {
  if (!requisition) return null;
  /** @type {Record<string, unknown>} */
  const evidence = {
    financialYear: requisition.financialYear || null,
    department: requisition.department || null,
  };

  if (requisition.procurementPlanItem) {
    const consumption = await computePlanItemConsumption(
      prisma,
      requisition.procurementPlanItem.id,
      requisition.id,
    );
    const plannedQty = Number(requisition.procurementPlanItem.quantity);
    const plannedValue = Number(requisition.procurementPlanItem.estimatedTotal);
    const reqQty = (requisition.items || []).reduce(
      (sum, i) => sum + Number(i.quantity || 0),
      0,
    );
    const reqValue = Number(requisition.estimatedTotalValue || 0);
    evidence.plan = {
      plan: requisition.procurementPlan,
      planItem: requisition.procurementPlanItem,
      plannedQuantity: plannedQty,
      plannedAmount: plannedValue,
      requisitionQuantity: reqQty,
      requisitionAmount: reqValue,
      remainingQuantity: plannedQty - consumption.usedQuantity - reqQty,
      remainingPlannedValue: plannedValue - consumption.usedValue - reqValue,
      otherConsumedQuantity: consumption.usedQuantity,
      otherConsumedValue: consumption.usedValue,
    };
  }

  if (requisition.budgetLine) {
    evidence.funding = computeBudgetAvailability(
      requisition.budgetLine,
      requisition.estimatedTotalValue,
    );
  }

  return evidence;
}
