import {
  OrgRequisitionStatus,
  OrgProcurementMethod,
  OrgWorkflowInstanceStatus,
  OrgWorkflowTaskStatus,
  Prisma,
} from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { PROCESS_FLOW_CODES, WORKFLOW_TRIGGERS } from "@/lib/projects/process-catalogue";
import {
  assertMethodProcessesActive,
  assertProcessActive,
} from "@/lib/projects/process-activation";
import {
  startWorkflowFromTrigger,
  checkWorkflowTaskActor,
  completeWorkflowTask,
  computeBudgetAvailability,
  prepareWorkflowTriggers,
} from "@/lib/projects/workflow-engine";
import { TxAbort, okOrAbort, runInTx, withTxAbort } from "@/lib/db-tx";
import { ORG_REF_DOC, nextOrgDocumentReference } from "@/lib/projects/org-reference";
import { resolveSlateIdForOrgCreate } from "@/lib/academic/org-academic-slate";
import { presentOrgWorkflowStatus } from "@/lib/projects/workflow-status-presentation";

const HOD_ROLE_NAMES = new Set(["Head User Department", "Head of User Department"]);

/**
 * True while the open workflow step is still HOD review (HOD has not acted yet).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; requisitionId: string }} opts
 */
export async function isRequisitionAwaitingHodReview(prisma, opts) {
  const openTask = await prisma.projectOrgWorkflowTask.findFirst({
    where: {
      projectId: opts.projectId,
      status: { in: [OrgWorkflowTaskStatus.PENDING, OrgWorkflowTaskStatus.IN_PROGRESS] },
      instance: {
        requisitionId: opts.requisitionId,
        status: {
          in: [OrgWorkflowInstanceStatus.ACTIVE, OrgWorkflowInstanceStatus.IN_PROGRESS],
        },
      },
    },
    orderBy: [{ stepNumber: "asc" }, { createdAt: "asc" }],
    select: { requiredRoleName: true, stepNumber: true },
  });
  if (!openTask) return false;
  return HOD_ROLE_NAMES.has(String(openTask.requiredRoleName || "").trim());
}

/**
 * Requester may edit/delete draft, returned, or submitted requisitions still waiting on HOD.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   requisition: { id: string; status: string; requesterOrgUserId: string };
 *   actorOrgUserId: string;
 * }} opts
 */
export async function getRequesterRequisitionMutationFlags(prisma, opts) {
  const { requisition, actorOrgUserId } = opts;
  const isRequester = requisition.requesterOrgUserId === actorOrgUserId;
  if (!isRequester) {
    return { canEdit: false, canDelete: false, awaitingHodReview: false };
  }

  const status = String(requisition.status || "");
  if (status === OrgRequisitionStatus.DRAFT || status === OrgRequisitionStatus.RETURNED) {
    return {
      canEdit: true,
      canDelete: true,
      awaitingHodReview: false,
    };
  }

  if (status === OrgRequisitionStatus.SUBMITTED) {
    const awaitingHodReview = await isRequisitionAwaitingHodReview(prisma, {
      projectId: opts.projectId,
      requisitionId: requisition.id,
    });
    return {
      canEdit: awaitingHodReview,
      canDelete: awaitingHodReview,
      awaitingHodReview,
    };
  }

  return { canEdit: false, canDelete: false, awaitingHodReview: false };
}

/**
 * @param {unknown} value
 */
function toDecimal(value) {
  const n = Number(
    String(value ?? "")
      .replace(/,/g, "")
      .replace(/\s/g, "")
      .replace(/[A-Za-z]/g, "")
      .trim(),
  );
  if (!Number.isFinite(n) || n <= 0) return null;
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
        // An approved requisition is already inside committedAmount; show the line as it stood before it.
        const selfCommitted = row.status === OrgRequisitionStatus.APPROVED;
        const line = selfCommitted
          ? {
              approvedAmount: row.budgetLine.approvedAmount,
              committedAmount: Math.max(
                0,
                Number(row.budgetLine.committedAmount || 0) - Number(row.estimatedTotalValue || 0),
              ),
            }
          : row.budgetLine;
        const funding = computeBudgetAvailability(line, row.estimatedTotalValue);
        return {
          selfCommitted,
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

  const presentation = presentOrgWorkflowStatus({
    status: row.status,
    workflowStage: row.workflowStage || null,
    viewerHasPendingAction: Boolean(row.viewerHasPendingAction),
    lastDecision: row.lastDecision || null,
  });
  const neutral = presentOrgWorkflowStatus({
    status: row.status,
    workflowStage: row.workflowStage || null,
    lastDecision: row.lastDecision || null,
  });

  return {
    id: row.id,
    title: row.title,
    stageLabel: neutral.label,
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
    statusLabel: presentation.label,
    statusColor: presentation.color,
    workflowStage: row.workflowStage || null,
    viewerHasPendingAction: Boolean(row.viewerHasPendingAction),
    procurementMethod: row.procurementMethod || null,
    submittedAt: row.submittedAt,
    approvedAt: row.approvedAt,
    requester: row.requester
      ? {
          id: row.requester.id,
          firstName: row.requester.firstName,
          lastName: row.requester.lastName,
          displayName: `${row.requester.firstName || ""} ${row.requester.lastName || ""}`.trim(),
          roleName: row.requester.projectOrgRole?.name || null,
        }
      : null,
    approvedBy: row.approvedBy
      ? {
          id: row.approvedBy.id,
          firstName: row.approvedBy.firstName,
          lastName: row.approvedBy.lastName,
          displayName: `${row.approvedBy.firstName || ""} ${row.approvedBy.lastName || ""}`.trim(),
          roleName: row.approvedBy.projectOrgRole?.name || null,
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
          planReference: row.procurementPlan.planReference || null,
          isEmergency: Boolean(row.procurementPlan.isEmergency),
          emergencyJustification: row.procurementPlan.emergencyJustification || null,
        }
      : null,
    isEmergency: Boolean(row.procurementPlan?.isEmergency),
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
    form5PartI: row.form5PartI || null,
    form5PartII: row.form5PartII || null,
    form5PartIAt: row.form5PartIAt || null,
    form5PartIIAt: row.form5PartIIAt || null,
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
  procurementPlan: {
    select: {
      id: true,
      title: true,
      status: true,
      planReference: true,
      isEmergency: true,
      emergencyJustification: true,
    },
  },
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
  requester: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      projectOrgRole: { select: { name: true } },
    },
  },
  approvedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      projectOrgRole: { select: { name: true } },
    },
  },
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

  if (!opts.requisitionId) {
    const inactive = await assertProcessActive(
      prisma,
      opts.projectId,
      PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION,
    );
    if (inactive) return inactive;
  }

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
    if (!itemName) {
      fieldErrors[`items.${idx}.itemName`] = "Enter an item name.";
    }
    if (!qty) {
      fieldErrors[`items.${idx}.quantity`] = "Enter a quantity greater than zero.";
    }
    if (!uom) {
      fieldErrors[`items.${idx}.unitOfMeasure`] = "Enter a unit.";
    }
    if (!unitPrice) {
      fieldErrors[`items.${idx}.estimatedUnitPrice`] = "Enter a unit price greater than zero.";
    }
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

  if (itemsIn.length > 0 && itemRows.length === 0) {
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
      fieldErrors[`items.0.quantity`] =
        fieldErrors[`items.0.quantity`] ||
        `Exceeds remaining planned quantity (${remainingQty}).`;
    }
    if (Number(total) > remainingValue + 0.009) {
      fieldErrors.estimatedTotalValue = `Requested value exceeds remaining planned value (${remainingValue.toFixed(2)}).`;
      fieldErrors[`items.0.estimatedUnitPrice`] =
        fieldErrors[`items.0.estimatedUnitPrice`] ||
        `Total exceeds remaining planned value (${remainingValue.toFixed(2)}).`;
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

  // Form 5 Part I is the official UD request — persist with the operational draft.
  const { buildForm5PartI } = await import("@/lib/projects/ppda-forms");
  const requester =
    opts.requesterOrgUserId
      ? await prisma.projectOrgUser.findFirst({
          where: { id: opts.requesterOrgUserId, projectId: opts.projectId },
          select: { firstName: true, lastName: true, projectOrgRole: { select: { name: true } } },
        })
      : null;
  const requesterName = requester
    ? `${requester.firstName || ""} ${requester.lastName || ""}`.trim()
    : "";
  const form5Body =
    b.form5 && typeof b.form5 === "object" ? { ...b.form5 } : {};
  if (requesterName) form5Body.memberName = requesterName;
  if (requester?.projectOrgRole?.name) form5Body.memberTitle = requester.projectOrgRole.name;
  if (!String(form5Body.memberTitle || "").trim()) {
    form5Body.memberTitle = "User Department Officer";
  }
  if (!String(form5Body.estimatedTotalCost || "").trim()) {
    form5Body.estimatedTotalCost = total.toString();
  }
  if (!String(form5Body.marketPrice || "").trim()) {
    form5Body.marketPrice = total.toString();
  }
  form5Body.voteHeadNo = await loadProjectVoteCode(prisma, opts.projectId);
  // Funds availability (Vote book): item = budget line, balance = available − this request.
  if (budgetLine) {
    const funding = computeBudgetAvailability(budgetLine, total);
    form5Body.fundingItem = [budgetLine.code, budgetLine.name].filter(Boolean).join(" — ");
    form5Body.balanceRemaining = (funding.availableBalance - funding.requestedAmount).toFixed(2);
  } else {
    form5Body.fundingItem = "";
    form5Body.balanceRemaining = "";
  }
  const form5Snap = buildForm5PartI(
    {
      title,
      category,
      requisitionReference,
      deliveryLocation,
      requiredByDate: b.requiredByDate || null,
      estimatedTotalValue: total.toString(),
      financialYear: fy ? { label: fy.label } : null,
      department: dept ? { code: dept.code, name: dept.name } : null,
      procurementPlan: plan ? { planReference: plan.planReference || null } : null,
      items: itemRows.map((it) => ({
        lineNumber: it.lineNumber,
        itemName: it.itemName,
        quantity: it.quantity,
        unitOfMeasure: it.unitOfMeasure,
        estimatedUnitPrice: it.estimatedUnitPrice,
        estimatedTotal: it.estimatedTotal,
      })),
    },
    form5Body,
  );

  let row;
  if (opts.requisitionId) {
    const existing = await prisma.projectOrgRequisition.findFirst({
      where: {
        id: opts.requisitionId,
        projectId: opts.projectId,
        requesterOrgUserId: opts.requesterOrgUserId,
      },
    });
    if (!existing) {
      return { ok: false, error: "Requisition not found or cannot be edited.", status: 404 };
    }

    const flags = await getRequesterRequisitionMutationFlags(prisma, {
      projectId: opts.projectId,
      requisition: existing,
      actorOrgUserId: opts.requesterOrgUserId,
    });
    if (!flags.canEdit) {
      return {
        ok: false,
        error:
          "You can only edit this requisition while it is a draft, returned, or still awaiting Head of User Department review.",
        status: 400,
      };
    }

    // Keep submitted status when editing before HOD acts; drafts/returned go back to DRAFT until resubmit.
    const nextStatus =
      existing.status === OrgRequisitionStatus.SUBMITTED && flags.awaitingHodReview
        ? OrgRequisitionStatus.SUBMITTED
        : OrgRequisitionStatus.DRAFT;

    row = await prisma.projectOrgRequisition.update({
      where: { id: existing.id },
      data: {
        ...payload,
        status: nextStatus,
        form5PartI: form5Snap,
        form5PartIAt: new Date(),
        items: { deleteMany: {}, create: itemRows },
      },
      include: requisitionInclude,
    });

    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ORG_REQUISITION_UPDATED,
      actorUserId: null,
      meta: {
        projectId: opts.projectId,
        requisitionId: row.id,
        title: row.title,
        status: row.status,
        actorOrgUserId: opts.requesterOrgUserId,
        awaitingHodReview: flags.awaitingHodReview,
      },
    });
  } else {
    row = await prisma.projectOrgRequisition.create({
      data: {
        projectId: opts.projectId,
        requesterOrgUserId: opts.requesterOrgUserId,
        orgAcademicSlateId: await resolveSlateIdForOrgCreate(prisma, opts.projectId),
        ...payload,
        form5PartI: form5Snap,
        form5PartIAt: new Date(),
        items: { create: itemRows },
      },
      include: requisitionInclude,
    });
  }

  return { ok: true, requisition: serializeRequisition(row) };
}

/**
 * Requester deletes a draft/returned requisition, or withdraws one still awaiting HOD review.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   requisitionId: string;
 *   actorOrgUserId: string;
 *   actorRoleName?: string | null;
 * }} opts
 */
export async function deleteRequisitionByRequester(prisma, opts) {
  const existing = await prisma.projectOrgRequisition.findFirst({
    where: { id: opts.requisitionId, projectId: opts.projectId },
    select: {
      id: true,
      title: true,
      status: true,
      requesterOrgUserId: true,
      requisitionReference: true,
    },
  });
  if (!existing) return { ok: false, error: "Requisition not found.", status: 404 };

  const flags = await getRequesterRequisitionMutationFlags(prisma, {
    projectId: opts.projectId,
    requisition: existing,
    actorOrgUserId: opts.actorOrgUserId,
  });
  if (!flags.canDelete) {
    return {
      ok: false,
      error:
        "You can only delete this requisition while it is a draft, returned, or still awaiting Head of User Department review.",
      status: 400,
    };
  }

  const linkedProcurement = await prisma.projectOrgProcurement.findFirst({
    where: { requisitionId: existing.id, projectId: opts.projectId },
    select: { id: true },
  });
  if (linkedProcurement) {
    return {
      ok: false,
      error: "This requisition already has a procurement case and cannot be deleted.",
      status: 400,
    };
  }

  await runInTx(prisma, async (tx) => {
    await tx.projectOrgWorkflowTask.updateMany({
      where: {
        projectId: opts.projectId,
        status: { in: [OrgWorkflowTaskStatus.PENDING, OrgWorkflowTaskStatus.IN_PROGRESS] },
        instance: { requisitionId: existing.id },
      },
      data: { status: OrgWorkflowTaskStatus.CANCELLED },
    });
    await tx.projectOrgWorkflowInstance.updateMany({
      where: {
        projectId: opts.projectId,
        requisitionId: existing.id,
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
    await tx.projectOrgRequisition.delete({ where: { id: existing.id } });
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_REQUISITION_DELETED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      requisitionId: existing.id,
      title: existing.title,
      requisitionReference: existing.requisitionReference,
      previousStatus: existing.status,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName || null,
      awaitingHodReview: flags.awaitingHodReview,
    },
  });

  return { ok: true };
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
  const inactive = await assertProcessActive(
    prisma,
    opts.projectId,
    PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION,
  );
  if (inactive) return inactive;

  await prepareWorkflowTriggers(prisma, opts.projectId);
  const outcome = await withTxAbort(() =>
    runInTx(prisma, async (db) => {
      // Close prior suspended instances / correction tasks on resubmit
      await db.projectOrgWorkflowInstance.updateMany({
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
      await db.projectOrgWorkflowTask.updateMany({
        where: {
          projectId: opts.projectId,
          status: OrgWorkflowTaskStatus.PENDING,
          instance: { requisitionId: row.id },
        },
        data: { status: OrgWorkflowTaskStatus.CANCELLED },
      });

      const started = await startWorkflowFromTrigger(db, {
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
        throw new TxAbort({
          ok: false,
          error: started.error,
          code: started.code,
          status: started.code === "NO_ELIGIBLE_ASSIGNEES" ? 400 : 409,
        });
      }

      const updated = await db.projectOrgRequisition.update({
        where: { id: row.id },
        data: {
          status: OrgRequisitionStatus.SUBMITTED,
          submittedAt: new Date(),
        },
        include: requisitionInclude,
      });
      return { ok: true, started, updated };
    }),
  );
  if (!outcome.ok) return outcome;
  const { started, updated } = outcome;

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
 * Which requisitions an org user may see: User Department Officers their own, Heads of User
 * Department their department; other roles (PDU, AO, committees…) the whole organisation.
 * @param {{ id: string; departmentId?: string | null; projectOrgRole?: { name?: string | null } | null }} orgUser
 * @returns {Record<string, unknown>}
 */
export function requisitionViewScopeWhere(orgUser) {
  const role = orgUser?.projectOrgRole?.name || "";
  if (role === "User Department Officer" || role === "User Department") {
    return { requesterOrgUserId: orgUser.id };
  }
  if ((role === "Head User Department" || role === "Head of User Department") && orgUser.departmentId) {
    return { departmentId: orgUser.departmentId };
  }
  return {};
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
 *   form5?: Record<string, unknown> | null;
 *   committeeId?: string | null;
 *   committeeRole?: string | null;
 * }} opts
 */
export async function actOnRequisitionTask(prisma, opts) {
  const methodOk =
    opts.procurementMethod &&
    Object.prototype.hasOwnProperty.call(OrgProcurementMethod, opts.procurementMethod);

  const taskPreview = await prisma.projectOrgWorkflowTask.findUnique({
    where: { id: opts.taskId },
    select: {
      status: true,
      assigneeOrgUserId: true,
      requiredRoleName: true,
      processFlowItem: { select: { actionKey: true } },
      instance: { select: { id: true, requisitionId: true, projectId: true } },
    },
  });
  if (!taskPreview?.instance?.requisitionId) {
    return {
      ok: false,
      error: "This task is not linked to a requisition.",
      status: 400,
    };
  }
  if (taskPreview.status !== "PENDING") {
    return { ok: false, error: "This task is no longer pending.", status: 400 };
  }
  const actorCheck = await checkWorkflowTaskActor(prisma, opts);
  if (!actorCheck.ok) return actorCheck;

  const actionKey = String(taskPreview.processFlowItem?.actionKey || "").trim().toUpperCase();
  const isCcMethodApprove =
    taskPreview.requiredRoleName === "Contracts Committee" &&
    (opts.decision === "APPROVE" || opts.decision === "COMPLETE") &&
    actionKey === "APPROVE";

  // PDU recommends method + Form 5 Part II — does not start the method branch yet.
  if (opts.decision === "SELECT_METHOD") {
    if (!methodOk) {
      return {
        ok: false,
        error: "Choose MICRO, QUOTATION, or TENDER.",
        status: 400,
        fieldErrors: { procurementMethod: "Choose a procurement method." },
      };
    }

    const { buildForm5PartII } = await import("@/lib/projects/ppda-forms");
    const { assessProviderSelection } = await import("@/lib/projects/providers");
    const form5Body = opts.form5 && typeof opts.form5 === "object" ? opts.form5 : {};
    const method = String(opts.procurementMethod);

    const reqRow = await prisma.projectOrgRequisition.findUnique({
      where: { id: taskPreview.instance.requisitionId },
      select: { category: true, estimatedTotalValue: true, procurementPlan: { select: { isEmergency: true } } },
    });
    const { checkMethodValueCeiling, minRfqProviders } = await import("@/lib/projects/procurement-thresholds");
    const isEmergency = Boolean(reqRow?.procurementPlan?.isEmergency);
    const minProviders = minRfqProviders(isEmergency);
    if (isEmergency && !String(form5Body.emergencyReasons || "").trim()) {
      return {
        ok: false,
        error: "Enter the reasons for the emergency.",
        status: 400,
        fieldErrors: { emergencyReasons: "Enter the reasons for the emergency." },
      };
    }
    const ceiling = checkMethodValueCeiling(method, reqRow?.estimatedTotalValue);
    if (!ceiling.ok) {
      return {
        ok: false,
        error: ceiling.error,
        status: 400,
        fieldErrors: { procurementMethod: ceiling.error },
      };
    }
    const methodBlocked = await assertMethodProcessesActive(
      prisma,
      taskPreview.instance.projectId,
      method,
    );
    if (methodBlocked) {
      return { ...methodBlocked, fieldErrors: { procurementMethod: methodBlocked.error } };
    }
    const rawIds = method === "TENDER" ? [] : form5Body.shortlistedProviderIds;
    const assessed = await assessProviderSelection(prisma, {
      projectId: taskPreview.instance.projectId,
      providerIds: rawIds,
      method,
      category: reqRow?.category || null,
    });
    if (!assessed.ok) {
      return { ...assessed, fieldErrors: { shortlistedProviderIds: assessed.error } };
    }
    const picked = assessed.providers;
    if (method === "MICRO" && picked.length > 1) {
      return {
        ok: false,
        error: "Micro procurement uses a single provider. Select only one.",
        status: 400,
        fieldErrors: { shortlistedProviderIds: "Select only one provider." },
      };
    }
    if (method === "QUOTATION" && picked.length === 0) {
      return {
        ok: false,
        error: "Shortlist at least one provider for request for quotations.",
        status: 400,
        fieldErrors: { shortlistedProviderIds: "Shortlist at least one provider." },
      };
    }
    if (
      method === "QUOTATION" &&
      picked.length < minProviders &&
      !String(form5Body.shortlistJustification || "").trim()
    ) {
      const word = isEmergency ? "two" : "three";
      return {
        ok: false,
        error: `Fewer than ${word} providers are shortlisted. Enter the justification.`,
        status: 400,
        fieldErrors: {
          shortlistJustification: `Explain why fewer than ${word} providers are shortlisted.`,
        },
      };
    }

    const costRaw = String(form5Body.biddingDocumentCost ?? "").replace(/,/g, "").trim();
    if (method === "TENDER" && costRaw && !(Number(costRaw) >= 0)) {
      return {
        ok: false,
        error: "Enter a valid bidding document cost.",
        status: 400,
        fieldErrors: { biddingDocumentCost: "Enter an amount." },
      };
    }
    const actor = await prisma.projectOrgUser.findUnique({
      where: { id: opts.actorOrgUserId },
      select: { firstName: true, lastName: true },
    });
    const actorName = `${actor?.firstName || ""} ${actor?.lastName || ""}`.trim();

    const snapshot = buildForm5PartII(
      {
        ...form5Body,
        pduOfficerName: actorName || form5Body.pduOfficerName,
        pduOfficerPosition: opts.actorRoleName || form5Body.pduOfficerPosition,
        dateSubmittedToCc: new Date().toISOString().slice(0, 10),
        biddingDocumentCost: method === "TENDER" ? costRaw : "",
        recommendedMethod: method,
        shortlistedProviders: picked.length
          ? picked.map((p) => p.name).join(", ")
          : method === "TENDER"
            ? "Open advertisement — no shortlist"
            : form5Body.shortlistedProviders,
      },
      {
        method,
        shortlist: picked.map((p) => ({
          id: p.id,
          name: p.name,
          qualifies: p.qualifies,
          failedReasons: p.failedReasons,
        })),
        shortlistValidatedAt: picked.length ? new Date().toISOString() : null,
      },
    );
    if (!snapshot.methodJustification) {
      return {
        ok: false,
        error: "Enter the justification for the recommended method.",
        status: 400,
        fieldErrors: { methodJustification: "Enter the justification for the method." },
      };
    }
    const result = await withTxAbort(() =>
      runInTx(prisma, async (tx) => {
        await tx.projectOrgRequisition.update({
          where: { id: taskPreview.instance.requisitionId },
          data: {
            procurementMethod: /** @type {import("@prisma/client").OrgProcurementMethod} */ (
              opts.procurementMethod
            ),
            form5PartII: snapshot,
            form5PartIIAt: new Date(),
          },
        });
        return okOrAbort(
          await completeWorkflowTask(tx, {
            taskId: opts.taskId,
            actorOrgUserId: opts.actorOrgUserId,
            actorRoleName: opts.actorRoleName,
            actorDepartmentId: opts.actorDepartmentId || null,
            decision: "SELECT_METHOD",
            comment: opts.comment,
            metadata: {
              procurementMethod: opts.procurementMethod,
              form5PartIISaved: true,
              awaitingContractsCommittee: true,
              shortlistedProviderIds: picked.map((p) => p.id),
              ...(assessed.warnings.length ? { eligibilityWarnings: assessed.warnings } : {}),
            },
          }),
        );
      }),
    );

    return {
      ...result,
      nextProcessStarted: false,
      awaitingContractsCommittee: true,
    };
  }

  // Contracts Committee approves the recommended method → start Micro/Quotation/Tender.
  if (isCcMethodApprove) {
    const req = await prisma.projectOrgRequisition.findFirst({
      where: { id: taskPreview.instance.requisitionId, projectId: taskPreview.instance.projectId },
      select: {
        id: true,
        status: true,
        procurementMethod: true,
        form5PartII: true,
        estimatedTotalValue: true,
      },
    });
    if (!req) {
      return { ok: false, error: "Requisition not found.", status: 404 };
    }
    const { checkMethodValueCeiling } = await import("@/lib/projects/procurement-thresholds");
    const ceiling = checkMethodValueCeiling(req.procurementMethod, req.estimatedTotalValue);
    if (!ceiling.ok) {
      return {
        ok: false,
        error: `${ceiling.error} Return it to the Procurement Officer.`,
        status: 400,
      };
    }
    if (req.status !== OrgRequisitionStatus.APPROVED) {
      return {
        ok: false,
        error: "Requisition must be approved by the Accounting Officer before method approval.",
        status: 400,
      };
    }
    const method = String(req.procurementMethod || "").trim().toUpperCase();
    if (!method || !Object.prototype.hasOwnProperty.call(OrgProcurementMethod, method)) {
      return {
        ok: false,
        error:
          "No recommended procurement method is on file. The Procurement Officer must submit Form 5 Part II first.",
        status: 400,
      };
    }

    const { createProcurementFromApprovedRequisition } = await import(
      "@/lib/projects/procurements"
    );
    await prepareWorkflowTriggers(prisma, taskPreview.instance.projectId);
    const outcome = await withTxAbort(() =>
      runInTx(prisma, async (tx) => {
        // Stamp CC decision onto Form 5 Part II snapshot when provided.
        if (opts.form5 && typeof opts.form5 === "object") {
          const prev =
            req.form5PartII && typeof req.form5PartII === "object" ? { ...req.form5PartII } : {};
          await tx.projectOrgRequisition.update({
            where: { id: req.id },
            data: {
              form5PartII: {
                ...prev,
                ccChairName: opts.form5.ccChairName || prev.ccChairName || "",
                ccSecretaryName: opts.form5.ccSecretaryName || prev.ccSecretaryName || "",
                ccDecisionAt: new Date().toISOString(),
                ccDecision: "APPROVE",
                ccDecisionByRole: opts.actorRoleName,
              },
              form5PartIIAt: new Date(),
            },
          });
        }

        const created = okOrAbort(
          await createProcurementFromApprovedRequisition(tx, {
            projectId: taskPreview.instance.projectId,
            requisitionId: req.id,
            procurementMethod: method,
            actorOrgUserId: opts.actorOrgUserId,
            actorRoleName: opts.actorRoleName,
            actorDepartmentId: opts.actorDepartmentId || null,
          }),
        );

        const result = okOrAbort(
          await completeWorkflowTask(tx, {
            taskId: opts.taskId,
            actorOrgUserId: opts.actorOrgUserId,
            actorRoleName: opts.actorRoleName,
            actorDepartmentId: opts.actorDepartmentId || null,
            committeeId: opts.committeeId || null,
            committeeRole: opts.committeeRole || null,
            decision: "APPROVE",
            comment: opts.comment,
            metadata: {
              procurementMethod: method,
              nextProcessQueued: created.nextProcessQueued,
              nextProcessStarted: true,
              procurementId: created.procurement?.id || null,
              procurementNumber: created.procurement?.procurementNumber || null,
              contractsCommitteeApproved: true,
            },
          }),
        );
        return { ok: true, created, result };
      }),
    );
    if (!outcome.ok) return outcome;
    const { created, result } = outcome;

    return {
      ...result,
      procurement: created.procurement,
      nextProcessQueued: created.nextProcessQueued,
      nextProcessStarted: true,
      workflow: created.workflow,
    };
  }

  return withTxAbort(() =>
    runInTx(prisma, async (tx) => {
      const result = okOrAbort(
        await completeWorkflowTask(tx, {
          taskId: opts.taskId,
          actorOrgUserId: opts.actorOrgUserId,
          actorRoleName: opts.actorRoleName,
          actorDepartmentId: opts.actorDepartmentId || null,
          committeeId: opts.committeeId || null,
          committeeRole: opts.committeeRole || null,
          decision: opts.decision,
          comment: opts.comment,
          metadata: null,
        }),
      );

      // Stamp Form 5 Part I confirmation names when HOD / AO approve.
      if (
        (opts.decision === "APPROVE" || opts.decision === "VERIFY") &&
        taskPreview.instance.requisitionId
      ) {
        const req = await tx.projectOrgRequisition.findUnique({
          where: { id: taskPreview.instance.requisitionId },
          select: { form5PartI: true },
        });
        if (req?.form5PartI && typeof req.form5PartI === "object") {
          const actor = await tx.projectOrgUser.findUnique({
            where: { id: opts.actorOrgUserId },
            select: { firstName: true, lastName: true },
          });
          const name = `${actor?.firstName || ""} ${actor?.lastName || ""}`.trim();
          const snap = { ...req.form5PartI };
          if (opts.actorRoleName === "Head User Department" || opts.actorRoleName === "Head of User Department") {
            if (name) {
              snap.hodName = name;
              snap.hodTitle = "Head User Department";
            }
          }
          if (opts.actorRoleName === "Accounting Officer" && opts.decision === "APPROVE") {
            if (name) {
              snap.aoName = name;
              snap.aoTitle = "Accounting Officer";
            }
          }
          await tx.projectOrgRequisition.update({
            where: { id: taskPreview.instance.requisitionId },
            data: { form5PartI: snap, form5PartIAt: new Date() },
          });
        }
      }

      return result;
    }),
  );
}

/**
 * Vote/Head No. on Form 5 always comes from organisation settings.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 */
export async function loadProjectVoteCode(prisma, projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { voteCode: true },
  });
  return project?.voteCode || "";
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
