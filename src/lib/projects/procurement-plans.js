import {
  OrgBudgetStatus,
  OrgProcurementPlanStatus,
  OrgWorkflowInstanceStatus,
  OrgWorkflowTaskStatus,
  Prisma,
} from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { WORKFLOW_TRIGGERS } from "@/lib/projects/process-catalogue";
import {
  computePlanningPeriodStatus,
} from "@/lib/projects/org-planning-periods";
import {
  completeWorkflowTask,
  startWorkflowFromTrigger,
} from "@/lib/projects/workflow-engine";
import { ORG_REF_DOC, nextOrgDocumentReference } from "@/lib/projects/org-reference";
import {
  resolveCurrentOrgSlate,
  resolveSlateIdForOrgCreate,
  withAcademicAuditMeta,
} from "@/lib/academic/org-academic-slate";

/**
 * @param {unknown} value
 */
function toDecimal(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/\s/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return new Prisma.Decimal(n.toFixed(2));
}

export const procurementPlanInclude = {
  financialYear: { select: { id: true, label: true } },
  planningPeriod: {
    select: { id: true, startDate: true, endDate: true, status: true, financialYearId: true },
  },
  department: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  items: {
    orderBy: { itemNumber: "asc" },
    include: {
      budgetLine: {
        select: {
          id: true,
          code: true,
          name: true,
          approvedAmount: true,
          committedAmount: true,
          budget: { select: { id: true, status: true, title: true } },
        },
      },
    },
  },
};

/**
 * @param {any} item
 */
export function serializePlanItem(item) {
  const bl = item.budgetLine;
  let budgetEvidence = null;
  if (bl) {
    const approved = Number(bl.approvedAmount || 0);
    const committed = Number(bl.committedAmount || 0);
    const planned = Number(item.estimatedTotal || 0);
    budgetEvidence = {
      budgetLineId: bl.id,
      code: bl.code,
      name: bl.name,
      approvedBudget: approved.toFixed(2),
      committedAmount: committed.toFixed(2),
      plannedAmount: planned.toFixed(2),
      remainingBudget: (approved - committed - planned).toFixed(2),
      budgetStatus: bl.budget?.status || null,
    };
  }
  return {
    id: item.id,
    itemNumber: item.itemNumber,
    title: item.title,
    description: item.description || null,
    specification: item.specification || null,
    category: item.category || null,
    quantity: item.quantity?.toString?.() ?? String(item.quantity),
    unitOfMeasure: item.unitOfMeasure,
    estimatedUnitPrice: item.estimatedUnitPrice?.toString?.() ?? String(item.estimatedUnitPrice),
    estimatedTotal: item.estimatedTotal?.toString?.() ?? String(item.estimatedTotal),
    budgetLineId: item.budgetLineId || null,
    budgetLine: bl
      ? { id: bl.id, code: bl.code, name: bl.name }
      : null,
    budgetEvidence,
    expectedProcurementPeriod: item.expectedProcurementPeriod || null,
    priority: item.priority || null,
    justification: item.justification || null,
    remarks: item.remarks || null,
  };
}

/**
 * @param {any} row
 */
export function serializeProcurementPlan(row) {
  const items = Array.isArray(row.items) ? row.items.map(serializePlanItem) : [];
  const total = items.reduce((sum, i) => sum + Number(i.estimatedTotal || 0), 0);
  const periodStatus = row.planningPeriod
    ? computePlanningPeriodStatus(row.planningPeriod.startDate, row.planningPeriod.endDate)
    : null;
  return {
    id: row.id,
    title: row.title,
    planReference: row.planReference || null,
    status: row.status,
    submittedAt: row.submittedAt,
    approvedAt: row.approvedAt,
    financialYear: row.financialYear
      ? { id: row.financialYear.id, label: row.financialYear.label }
      : null,
    planningPeriod: row.planningPeriod
      ? {
          id: row.planningPeriod.id,
          status: periodStatus,
          financialYearId: row.planningPeriod.financialYearId,
        }
      : null,
    department: row.department
      ? {
          id: row.department.id,
          name: row.department.name,
          code: row.department.code || null,
        }
      : null,
    createdBy: row.createdBy
      ? {
          id: row.createdBy.id,
          firstName: row.createdBy.firstName,
          lastName: row.createdBy.lastName,
          displayName: `${row.createdBy.firstName || ""} ${row.createdBy.lastName || ""}`.trim(),
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
    items,
    totals: {
      estimatedTotal: total.toFixed(2),
      itemCount: items.length,
    },
    isConsolidated: Boolean(row.isConsolidated),
    consolidatedIntoPlanId: row.consolidatedIntoPlanId || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {any[]} itemsIn
 * @param {string} financialYearId
 */
async function validateAndBuildPlanItems(prisma, projectId, itemsIn, financialYearId) {
  /** @type {Record<string, string>} */
  const fieldErrors = {};
  /** @type {any[]} */
  const itemRows = [];
  let total = new Prisma.Decimal(0);

  if (!Array.isArray(itemsIn) || itemsIn.length === 0) {
    fieldErrors.items = "Add at least one plan item.";
    return { fieldErrors, itemRows, total };
  }

  for (let idx = 0; idx < itemsIn.length; idx += 1) {
    const raw = itemsIn[idx];
    const title = typeof raw?.title === "string" ? raw.title.trim() : "";
    const qty = toDecimal(raw?.quantity);
    const unitPrice = toDecimal(raw?.estimatedUnitPrice);
    const uom =
      typeof raw?.unitOfMeasure === "string" && raw.unitOfMeasure.trim()
        ? raw.unitOfMeasure.trim()
        : "Unit";
    const budgetLineId =
      typeof raw?.budgetLineId === "string" ? raw.budgetLineId.trim() || null : null;

    if (!title || !qty || !unitPrice) {
      fieldErrors[`items.${idx}`] = "Each item needs title, quantity, and unit price.";
      if (!qty) fieldErrors[`items.${idx}.quantity`] = "Enter a quantity greater than zero.";
      if (!unitPrice) {
        fieldErrors[`items.${idx}.estimatedUnitPrice`] =
          "Enter a unit price greater than zero.";
      }
      if (!title) fieldErrors[`items.${idx}.title`] = "Enter an item title.";
      continue;
    }

    if (!budgetLineId) {
      fieldErrors[`items.${idx}.budgetLineId`] = "Choose a budget line.";
      continue;
    }

    const lineTotal = qty.mul(unitPrice);
    total = total.add(lineTotal);

    let budgetLine = null;
    budgetLine = await prisma.projectOrgBudgetLine.findFirst({
      where: {
        id: budgetLineId,
        projectId,
        financialYearId,
        isActive: true,
        budget: { status: OrgBudgetStatus.APPROVED },
      },
      include: { budget: true },
    });
    if (!budgetLine) {
      fieldErrors[`items.${idx}.budgetLineId`] =
        "Choose an approved budget line for this financial year.";
      continue;
    }
    const available =
      Number(budgetLine.approvedAmount) - Number(budgetLine.committedAmount);
    if (Number(lineTotal) > available + 0.009) {
      fieldErrors[`items.${idx}.estimatedTotal`] =
        `Planned amount exceeds remaining budget on ${budgetLine.code} (${available.toFixed(2)}).`;
    }

    itemRows.push({
      itemNumber: idx + 1,
      title,
      description: typeof raw?.description === "string" ? raw.description.trim() || null : null,
      specification:
        typeof raw?.specification === "string" ? raw.specification.trim() || null : null,
      category: typeof raw?.category === "string" ? raw.category.trim() || null : null,
      quantity: qty,
      unitOfMeasure: uom,
      estimatedUnitPrice: unitPrice,
      estimatedTotal: lineTotal,
      budgetLineId: budgetLine?.id || null,
      expectedProcurementPeriod:
        typeof raw?.expectedProcurementPeriod === "string"
          ? raw.expectedProcurementPeriod.trim() || null
          : null,
      priority: typeof raw?.priority === "string" ? raw.priority.trim() || "Normal" : "Normal",
      justification:
        typeof raw?.justification === "string" ? raw.justification.trim() || null : null,
      remarks: typeof raw?.remarks === "string" ? raw.remarks.trim() || null : null,
    });
  }

  if (itemRows.length === 0 && !fieldErrors.items) {
    fieldErrors.items = "Add at least one valid plan item.";
  }

  return { fieldErrors, itemRows, total };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   actorOrgUserId: string;
 *   departmentId: string;
 *   body: any;
 *   planId?: string | null;
 * }} opts
 */
export async function createOrUpdateProcurementPlanDraft(prisma, opts) {
  const b = opts.body || {};
  /** @type {Record<string, string>} */
  const fieldErrors = {};

  const title = typeof b.title === "string" ? b.title.trim() : "";
  let planReference =
    typeof b.planReference === "string" ? b.planReference.trim() || null : null;
  const financialYearId = typeof b.financialYearId === "string" ? b.financialYearId.trim() : "";
  const planningPeriodId =
    typeof b.planningPeriodId === "string" ? b.planningPeriodId.trim() || null : null;

  if (!title) fieldErrors.title = "Enter a plan title.";
  if (!financialYearId) fieldErrors.financialYearId = "Choose a financial year.";
  if (!opts.departmentId) fieldErrors.departmentId = "Your account must belong to a department.";

  const fy = financialYearId
    ? await prisma.projectOrgFinancialYear.findFirst({
        where: { id: financialYearId, projectId: opts.projectId },
      })
    : null;
  if (financialYearId && !fy) fieldErrors.financialYearId = "Choose a valid financial year.";
  else if (fy) {
    const { isFinancialYearCurrentlyValid } = await import("@/lib/projects/org-financial-years");
    if (!fy.isActive || !isFinancialYearCurrentlyValid(fy.startDate, fy.endDate)) {
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

  let planningPeriod = null;
  if (planningPeriodId) {
    planningPeriod = await prisma.projectOrgPlanningPeriod.findFirst({
      where: { id: planningPeriodId, projectId: opts.projectId },
    });
    if (!planningPeriod) {
      fieldErrors.planningPeriodId = "Choose a valid planning period.";
    } else if (fy && planningPeriod.financialYearId !== fy.id) {
      fieldErrors.planningPeriodId = "Planning period must belong to the selected financial year.";
    } else {
      const status = computePlanningPeriodStatus(
        planningPeriod.startDate,
        planningPeriod.endDate,
      );
      if (status !== "OPEN") {
        fieldErrors.planningPeriodId = "Planning period must be open to create or edit plans.";
      }
    }
  } else {
    fieldErrors.planningPeriodId = "Choose a planning period.";
  }

  if (!planReference && fy && dept) {
    const existing = await prisma.projectOrgProcurementPlan.findMany({
      where: { projectId: opts.projectId, planReference: { not: null } },
      select: { planReference: true },
    });
    planReference = nextOrgDocumentReference(
      existing.map((r) => r.planReference).filter(Boolean),
      {
        deptCode: dept.code,
        deptName: dept.name,
        docType: ORG_REF_DOC.PROCUREMENT_PLAN,
        fyLabel: fy.label,
      },
    );
  }

  if (planReference) {
    const clash = await prisma.projectOrgProcurementPlan.findFirst({
      where: {
        projectId: opts.projectId,
        planReference,
        ...(opts.planId ? { id: { not: opts.planId } } : {}),
      },
      select: { id: true },
    });
    if (clash) fieldErrors.planReference = "This plan reference is already in use.";
  }

  const built = await validateAndBuildPlanItems(
    prisma,
    opts.projectId,
    Array.isArray(b.items) ? b.items : [],
    financialYearId,
  );
  Object.assign(fieldErrors, built.fieldErrors);

  if (Object.keys(fieldErrors).length) {
    return { ok: false, fieldErrors, error: "Please fix the highlighted fields." };
  }

  let row;
  if (opts.planId) {
    const existing = await prisma.projectOrgProcurementPlan.findFirst({
      where: {
        id: opts.planId,
        projectId: opts.projectId,
        createdByOrgUserId: opts.actorOrgUserId,
        status: {
          in: [OrgProcurementPlanStatus.DRAFT, OrgProcurementPlanStatus.RETURNED],
        },
      },
    });
    if (!existing) {
      return { ok: false, error: "Plan not found or cannot be edited.", status: 404 };
    }
    await prisma.projectOrgProcurementPlanItem.deleteMany({
      where: { procurementPlanId: existing.id },
    });
    row = await prisma.projectOrgProcurementPlan.update({
      where: { id: existing.id },
      data: {
        title,
        planReference,
        financialYearId,
        planningPeriodId: planningPeriod?.id || null,
        departmentId: opts.departmentId,
        status: OrgProcurementPlanStatus.DRAFT,
        items: { create: built.itemRows },
      },
      include: procurementPlanInclude,
    });
  } else {
    row = await prisma.projectOrgProcurementPlan.create({
      data: {
        projectId: opts.projectId,
        title,
        planReference,
        financialYearId,
        planningPeriodId: planningPeriod?.id || null,
        departmentId: opts.departmentId,
        createdByOrgUserId: opts.actorOrgUserId,
        status: OrgProcurementPlanStatus.DRAFT,
        orgAcademicSlateId: await resolveSlateIdForOrgCreate(prisma, opts.projectId),
        items: { create: built.itemRows },
      },
      include: procurementPlanInclude,
    });
  }

  const slate = row.orgAcademicSlateId
    ? await resolveCurrentOrgSlate(prisma, opts.projectId)
    : null;

  await writeAuditLog({
    eventType: opts.planId
      ? AuditEvent.PROJECT_ORG_PROCUREMENT_PLAN_UPDATED
      : AuditEvent.PROJECT_ORG_PROCUREMENT_PLAN_CREATED,
    actorUserId: null,
    meta: withAcademicAuditMeta(
      {
        projectId: opts.projectId,
        planId: row.id,
        actorOrgUserId: opts.actorOrgUserId,
        departmentId: opts.departmentId,
        status: row.status,
      },
      slate,
    ),
  });

  return { ok: true, plan: serializeProcurementPlan(row) };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   planId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   actorDepartmentId?: string | null;
 * }} opts
 */
export async function submitProcurementPlan(prisma, opts) {
  const row = await prisma.projectOrgProcurementPlan.findFirst({
    where: { id: opts.planId, projectId: opts.projectId },
    include: { planningPeriod: true, items: true },
  });
  if (!row) return { ok: false, error: "Plan not found.", status: 404 };
  if (row.createdByOrgUserId !== opts.actorOrgUserId) {
    return { ok: false, error: "Only the plan creator can submit this draft.", status: 403 };
  }
  if (![OrgProcurementPlanStatus.DRAFT, OrgProcurementPlanStatus.RETURNED].includes(row.status)) {
    return { ok: false, error: "This plan cannot be submitted.", status: 400 };
  }
  if (!row.items?.length) {
    return { ok: false, error: "Add plan items before submitting.", status: 400 };
  }
  if (!row.planningPeriodId || !row.planningPeriod) {
    return { ok: false, error: "A planning period is required.", status: 400 };
  }
  const periodStatus = computePlanningPeriodStatus(
    row.planningPeriod.startDate,
    row.planningPeriod.endDate,
  );
  if (periodStatus !== "OPEN") {
    return {
      ok: false,
      error: "Cannot submit a plan while the planning period is not open.",
      code: "PLANNING_PERIOD_CLOSED",
      status: 400,
    };
  }

  await prisma.projectOrgWorkflowInstance.updateMany({
    where: {
      procurementPlanId: row.id,
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
      instance: { procurementPlanId: row.id },
    },
    data: { status: OrgWorkflowTaskStatus.CANCELLED },
  });

  const started = await startWorkflowFromTrigger(prisma, {
    projectId: opts.projectId,
    triggerKey: WORKFLOW_TRIGGERS.PLANNING_SUBMITTED,
    entityType: "procurement_plan",
    entityId: row.id,
    procurementPlanId: row.id,
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

  const updated = await prisma.projectOrgProcurementPlan.update({
    where: { id: row.id },
    data: {
      status: OrgProcurementPlanStatus.SUBMITTED,
      submittedAt: new Date(),
    },
    include: procurementPlanInclude,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROCUREMENT_PLAN_SUBMITTED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      planId: row.id,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      departmentId: row.departmentId,
      instanceId: started.instance.id,
      previousStatus: row.status,
      newStatus: OrgProcurementPlanStatus.SUBMITTED,
    },
  });

  return {
    ok: true,
    plan: serializeProcurementPlan(updated),
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
 * }} opts
 */
export async function actOnProcurementPlanTask(prisma, opts) {
  return completeWorkflowTask(prisma, {
    taskId: opts.taskId,
    actorOrgUserId: opts.actorOrgUserId,
    actorRoleName: opts.actorRoleName,
    actorDepartmentId: opts.actorDepartmentId || null,
    decision: opts.decision,
    comment: opts.comment,
  });
}

/**
 * MVP PDU consolidation: create (or update) an org-level consolidated plan shell and
 * link selected departmental plans into it. Does not auto-merge individual items.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   financialYearId: string;
 *   planningPeriodId?: string | null;
 *   title?: string;
 *   sourcePlanIds: string[];
 * }} opts
 */
export async function consolidateDepartmentPlans(prisma, opts) {
  const role = String(opts.actorRoleName || "");
  if (role !== "Head PDU") {
    return {
      ok: false,
      error: "Only the Head PDU can consolidate departmental procurement plans.",
      status: 403,
    };
  }

  const sourceIds = Array.isArray(opts.sourcePlanIds)
    ? [...new Set(opts.sourcePlanIds.map((id) => String(id || "").trim()).filter(Boolean))]
    : [];
  if (sourceIds.length === 0) {
    return { ok: false, error: "Select at least one departmental plan to consolidate.", status: 400 };
  }

  const fy = await prisma.projectOrgFinancialYear.findFirst({
    where: { id: opts.financialYearId, projectId: opts.projectId },
  });
  if (!fy) {
    return { ok: false, error: "Choose a valid financial year.", status: 400 };
  }

  const sources = await prisma.projectOrgProcurementPlan.findMany({
    where: {
      projectId: opts.projectId,
      id: { in: sourceIds },
      financialYearId: opts.financialYearId,
      isConsolidated: false,
    },
    include: { items: true, department: true },
  });
  if (sources.length !== sourceIds.length) {
    return {
      ok: false,
      error:
        "Every selected plan must belong to this organisation and financial year, and must not already be a consolidated shell.",
      status: 400,
    };
  }

  const eligible = sources.filter((p) =>
    [OrgProcurementPlanStatus.SUBMITTED, OrgProcurementPlanStatus.UNDER_REVIEW, OrgProcurementPlanStatus.APPROVED].includes(
      p.status,
    ),
  );
  if (eligible.length === 0) {
    return {
      ok: false,
      error: "Consolidate plans only after they have been submitted (or are under review / approved).",
      status: 400,
    };
  }

  const title =
    (typeof opts.title === "string" && opts.title.trim()) ||
    `Consolidated Procurement Plan ${fy.label}`;
  const planReference = `ORG-CPP-${Date.now().toString().slice(-6)}`;

  const consolidated = await prisma.$transaction(async (tx) => {
    const shell = await tx.projectOrgProcurementPlan.create({
      data: {
        projectId: opts.projectId,
        financialYearId: opts.financialYearId,
        planningPeriodId: opts.planningPeriodId || eligible[0].planningPeriodId || null,
        departmentId: null,
        planReference,
        title,
        status: OrgProcurementPlanStatus.UNDER_REVIEW,
        isConsolidated: true,
        createdByOrgUserId: opts.actorOrgUserId,
        submittedAt: new Date(),
      },
    });

    await tx.projectOrgProcurementPlan.updateMany({
      where: { id: { in: eligible.map((p) => p.id) } },
      data: { consolidatedIntoPlanId: shell.id },
    });

    return shell;
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PROCUREMENT_PLAN_CONSOLIDATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      consolidatedPlanId: consolidated.id,
      sourcePlanIds: eligible.map((p) => p.id),
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      financialYearId: opts.financialYearId,
    },
  });

  const full = await prisma.projectOrgProcurementPlan.findUnique({
    where: { id: consolidated.id },
    include: {
      ...procurementPlanInclude,
      sourcePlans: {
        select: {
          id: true,
          title: true,
          planReference: true,
          status: true,
          department: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });

  return {
    ok: true,
    plan: {
      ...serializeProcurementPlan(full),
      sourcePlans: full?.sourcePlans || [],
    },
  };
}
