import {
  OrgProcurementMethod,
  OrgProcurementStatus,
  OrgRequisitionStatus,
  OrgBudgetStatus,
} from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import {
  METHOD_PROCESS_BY_ENUM,
} from "@/lib/projects/process-catalogue";
import { prepareWorkflowTriggers, startWorkflowFromTrigger } from "@/lib/projects/workflow-engine";
import { TxAbort, isTxClient, runInTx, withTxAbort } from "@/lib/db-tx";
import { assertMethodProcessesActive } from "@/lib/projects/process-activation";
import { financialYearRefToken } from "@/lib/projects/org-reference";
import { serializePurchaseInstruction } from "@/lib/projects/purchase-instructions";
import { serializeSolicitation, serializeOffer } from "@/lib/projects/solicitations";
import {
  serializeTimelineAction,
  mergeProcurementTimeline,
} from "@/lib/projects/procurement-timeline";
import { serializeAward, awardInclude } from "@/lib/projects/awards";
import { serializeDelivery, deliveryInclude } from "@/lib/projects/deliveries";
import { serializeDeliveryNote } from "@/lib/projects/delivery-notes";
import { notifyProvider } from "@/lib/projects/provider-notifications";
import { serializeInvoice, invoiceInclude } from "@/lib/projects/invoices";
import { serializePayment, paymentInclude } from "@/lib/projects/payments";
import { serializeContract, serializeLpo } from "@/lib/projects/contracts-lpo";
import {
  resolveCurrentOrgSlate,
  resolveSlateIdForOrgCreate,
  withAcademicAuditMeta,
} from "@/lib/academic/org-academic-slate";

export const procurementInclude = {
  financialYear: { select: { id: true, label: true } },
  department: { select: { id: true, name: true, code: true } },
  officer: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  requisition: {
    select: {
      id: true,
      title: true,
      status: true,
      requisitionReference: true,
      estimatedTotalValue: true,
      procurementMethod: true,
      needDescription: true,
      category: true,
      deliveryLocation: true,
      form5PartII: true,
      items: {
        orderBy: { lineNumber: "asc" },
        select: {
          id: true,
          lineNumber: true,
          itemName: true,
          description: true,
          quantity: true,
          unitOfMeasure: true,
          estimatedUnitPrice: true,
          estimatedTotal: true,
        },
      },
    },
  },
  deliveryNotes: {
    orderBy: { createdAt: "desc" },
    include: { supplier: { select: { id: true, name: true } } },
  },
  procurementPlanItem: {
    select: {
      id: true,
      title: true,
      quantity: true,
      estimatedUnitPrice: true,
      estimatedTotal: true,
      unitOfMeasure: true,
      procurementPlan: { select: { isEmergency: true, emergencyJustification: true } },
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
  instances: {
    orderBy: { startedAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      triggerKey: true,
      currentStepNumber: true,
      startedAt: true,
      completedAt: true,
      processFlow: { select: { id: true, name: true, code: true } },
      actions: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          decision: true,
          comment: true,
          actorRoleName: true,
          committeeId: true,
          committeeRole: true,
          previousStatus: true,
          newStatus: true,
          createdAt: true,
          metadata: true,
          actor: {
            select: { id: true, firstName: true, lastName: true },
          },
          task: { select: { requiredRoleName: true } },
        },
      },
    },
  },
  purchaseInstructions: {
    orderBy: { createdAt: "desc" },
    include: {
      supplier: true,
      issuedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  solicitations: {
    orderBy: { createdAt: "desc" },
    include: {
      invites: { include: { supplier: true }, orderBy: { invitedAt: "asc" } },
      offers: { select: { id: true } },
    },
  },
  offers: {
    orderBy: { submittedAt: "asc" },
    include: { supplier: true, clarifications: { orderBy: { askedAt: "asc" } } },
  },
  awards: {
    orderBy: { createdAt: "desc" },
    include: awardInclude,
  },
  contracts: {
    orderBy: { createdAt: "desc" },
    include: {
      supplier: true,
    },
  },
  lpos: {
    orderBy: { createdAt: "desc" },
    include: {
      supplier: true,
    },
  },
  deliveries: {
    orderBy: { createdAt: "asc" },
    include: deliveryInclude,
  },
  invoices: {
    orderBy: { createdAt: "asc" },
    include: invoiceInclude,
  },
  payments: {
    orderBy: { createdAt: "asc" },
    include: paymentInclude,
  },
  evaluationReports: {
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      evaluatedAmount: true,
      recommendation: true,
      comments: true,
      eligibilityJson: true,
      approvedAt: true,
      createdAt: true,
      recommendedSupplier: { select: { id: true, name: true } },
      committee: {
        select: {
          name: true,
          members: {
            where: { status: "ACTIVE" },
            orderBy: { committeeRole: "asc" },
            select: { committeeRole: true, orgUser: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
  },
  postQualificationReports: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { id: true, status: true, comments: true, validationJson: true, approvedAt: true, createdAt: true },
  },
  closedBy: { select: { id: true, firstName: true, lastName: true } },
};

/**
 * @param {any} row
 * @param {{ domainTimeline?: any[] }} [opts]
 */
export function serializeProcurement(row, opts = {}) {
  const workflowEntries = [];
  for (const inst of row.instances || []) {
    for (const a of inst.actions || []) {
      workflowEntries.push(
        serializeTimelineAction(a, {
          processName: inst.processFlow?.name || null,
          procurementNumber: row.procurementNumber || null,
        }),
      );
    }
  }
  const timeline = mergeProcurementTimeline(workflowEntries, opts.domainTimeline || []);

  const latestAward =
    Array.isArray(row.awards) && row.awards.length > 0 ? serializeAward(row.awards[0]) : null;
  const latestLpo =
    Array.isArray(row.lpos) && row.lpos.length > 0 ? serializeLpo(row.lpos[0]) : null;
  const latestContract =
    Array.isArray(row.contracts) && row.contracts.length > 0
      ? serializeContract(row.contracts[0])
      : null;

  return {
    id: row.id,
    procurementNumber: row.procurementNumber,
    title: row.title,
    procurementMethod: row.procurementMethod,
    status: row.status,
    methodSelectedAt: row.methodSelectedAt || null,
    requiresPostQualification: Boolean(row.requiresPostQualification),
    closedAt: row.closedAt || null,
    closureRemarks: row.closureRemarks || null,
    closedBy: row.closedBy
      ? {
          id: row.closedBy.id,
          displayName: `${row.closedBy.firstName || ""} ${row.closedBy.lastName || ""}`.trim(),
        }
      : null,
    financialYear: row.financialYear
      ? { id: row.financialYear.id, label: row.financialYear.label }
      : null,
    department: row.department
      ? {
          id: row.department.id,
          name: row.department.name,
          code: row.department.code || null,
        }
      : null,
    officer: row.officer
      ? {
          id: row.officer.id,
          displayName: `${row.officer.firstName || ""} ${row.officer.lastName || ""}`.trim(),
        }
      : null,
    requisition: row.requisition
      ? {
          id: row.requisition.id,
          title: row.requisition.title,
          status: row.requisition.status,
          requisitionReference: row.requisition.requisitionReference || null,
          needDescription: row.requisition.needDescription || null,
          category: row.requisition.category || null,
          deliveryLocation: row.requisition.deliveryLocation || null,
          shortlist: Array.isArray(row.requisition.form5PartII?.shortlist)
            ? row.requisition.form5PartII.shortlist
            : [],
          biddingDocumentCost: row.requisition.form5PartII?.biddingDocumentCost || null,
          estimatedTotalValue:
            row.requisition.estimatedTotalValue?.toString?.() ??
            String(row.requisition.estimatedTotalValue ?? ""),
          items: Array.isArray(row.requisition.items)
            ? row.requisition.items.map((it) => ({
                id: it.id,
                lineNumber: it.lineNumber,
                itemName: it.itemName,
                description: it.description || null,
                quantity: it.quantity?.toString?.() ?? String(it.quantity ?? ""),
                unitOfMeasure: it.unitOfMeasure || null,
                estimatedUnitPrice:
                  it.estimatedUnitPrice?.toString?.() ?? String(it.estimatedUnitPrice ?? ""),
                estimatedTotal:
                  it.estimatedTotal?.toString?.() ?? String(it.estimatedTotal ?? ""),
              }))
            : [],
        }
      : null,
    isEmergency: Boolean(row.procurementPlanItem?.procurementPlan?.isEmergency),
    emergencyJustification: row.procurementPlanItem?.procurementPlan?.emergencyJustification || null,
    procurementPlanItem: row.procurementPlanItem
      ? {
          id: row.procurementPlanItem.id,
          title: row.procurementPlanItem.title,
          quantity: row.procurementPlanItem.quantity?.toString?.(),
          estimatedUnitPrice: row.procurementPlanItem.estimatedUnitPrice?.toString?.(),
          estimatedTotal: row.procurementPlanItem.estimatedTotal?.toString?.(),
          unitOfMeasure: row.procurementPlanItem.unitOfMeasure || null,
        }
      : null,
    budgetLine: row.budgetLine
      ? {
          id: row.budgetLine.id,
          code: row.budgetLine.code,
          name: row.budgetLine.name,
          approvedAmount: row.budgetLine.approvedAmount?.toString?.(),
          committedAmount: row.budgetLine.committedAmount?.toString?.(),
        }
      : null,
    timeline,
    workflowTimeline: workflowEntries,
    purchaseInstruction:
      Array.isArray(row.purchaseInstructions) && row.purchaseInstructions.length > 0
        ? serializePurchaseInstruction(row.purchaseInstructions[0])
        : null,
    purchaseInstructions: Array.isArray(row.purchaseInstructions)
      ? row.purchaseInstructions.map(serializePurchaseInstruction)
      : undefined,
    solicitations: Array.isArray(row.solicitations)
      ? row.solicitations.map(serializeSolicitation)
      : undefined,
    offers: Array.isArray(row.offers) ? row.offers.map(serializeOffer) : undefined,
    award: latestAward,
    awards: Array.isArray(row.awards) ? row.awards.map(serializeAward) : [],
    lpo: latestLpo,
    lpos: Array.isArray(row.lpos) ? row.lpos.map(serializeLpo) : [],
    contract: latestContract,
    contracts: Array.isArray(row.contracts) ? row.contracts.map(serializeContract) : [],
    deliveries: Array.isArray(row.deliveries) ? row.deliveries.map(serializeDelivery) : [],
    deliveryNotes: Array.isArray(row.deliveryNotes) ? row.deliveryNotes.map(serializeDeliveryNote) : [],
    invoices: Array.isArray(row.invoices) ? row.invoices.map(serializeInvoice) : [],
    payments: Array.isArray(row.payments) ? row.payments.map(serializePayment) : [],
    evaluationReports: Array.isArray(row.evaluationReports)
      ? row.evaluationReports.map((er) => ({
          id: er.id,
          status: er.status,
          evaluatedAmount: er.evaluatedAmount?.toString?.() ?? String(er.evaluatedAmount ?? ""),
          recommendation: er.recommendation || null,
          comments: er.comments || null,
          eligibility: er.eligibilityJson || null,
          approvedAt: er.approvedAt || null,
          createdAt: er.createdAt || null,
          recommendedSupplier: er.recommendedSupplier
            ? { id: er.recommendedSupplier.id, name: er.recommendedSupplier.name }
            : null,
          committee: er.committee
            ? {
                name: er.committee.name,
                members: (er.committee.members || []).map((m) => ({
                  name: `${m.orgUser?.firstName || ""} ${m.orgUser?.lastName || ""}`.trim(),
                  committeeRole: m.committeeRole,
                })),
              }
            : null,
        }))
      : [],
    postQualificationReports: Array.isArray(row.postQualificationReports)
      ? row.postQualificationReports.map((pq) => ({
          id: pq.id,
          status: pq.status,
          comments: pq.comments || null,
          validation: pq.validationJson || null,
          approvedAt: pq.approvedAt || null,
          createdAt: pq.createdAt || null,
        }))
      : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} fyLabel
 */
async function nextProcurementNumber(prisma, projectId, fyLabel) {
  const year = financialYearRefToken(fyLabel);
  const prefix = `PROC-${year}-`;
  const existing = await prisma.projectOrgProcurement.findMany({
    where: {
      projectId,
      procurementNumber: { startsWith: prefix },
    },
    select: { procurementNumber: true },
  });
  let max = 0;
  for (const row of existing) {
    const m = String(row.procurementNumber || "").match(/-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/**
 * Validate + create Procurement from an approved requisition, then start method workflow.
 * Atomic: rolls back procurement if the method process cannot start.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   requisitionId: string;
 *   procurementMethod: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   actorDepartmentId?: string | null;
 * }} opts
 */
export async function createProcurementFromApprovedRequisition(prisma, opts) {
  const method = String(opts.procurementMethod || "").trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(OrgProcurementMethod, method) || method === "OTHER") {
    return {
      ok: false,
      error: "Choose MICRO, QUOTATION, or TENDER as the procurement method.",
      status: 400,
      fieldErrors: { procurementMethod: "Choose MICRO, QUOTATION, or TENDER." },
    };
  }

  const methodMeta = METHOD_PROCESS_BY_ENUM[method];
  if (!methodMeta) {
    return {
      ok: false,
      error: "Choose MICRO, QUOTATION, or TENDER as the procurement method.",
      status: 400,
    };
  }

  const req = await prisma.projectOrgRequisition.findFirst({
    where: { id: opts.requisitionId, projectId: opts.projectId },
    include: {
      financialYear: true,
      department: true,
      procurementPlan: { select: { id: true, status: true, title: true } },
      procurementPlanItem: true,
      budgetLine: { include: { budget: { select: { id: true, status: true } } } },
    },
  });

  if (!req) {
    return {
      ok: false,
      error: "Requisition not found in this organisation.",
      status: 404,
    };
  }

  if (req.status !== OrgRequisitionStatus.APPROVED) {
    return {
      ok: false,
      error:
        "This requisition cannot proceed because it has not yet been approved by the Accounting Officer.",
      status: 400,
      code: "REQUISITION_NOT_APPROVED",
    };
  }

  const existingProcurement = await prisma.projectOrgProcurement.findFirst({
    where: { requisitionId: req.id },
    include: procurementInclude,
  });

  // Retry / heal: method or procurement already saved, but the SELECT_METHOD
  // task may still be open if the first click only partially succeeded.
  if (existingProcurement) {
    const existingMethod = String(existingProcurement.procurementMethod || "").toUpperCase();
    if (existingMethod && existingMethod !== method) {
      return {
        ok: false,
        error: `A procurement method (${existingMethod}) has already been selected for this requisition.`,
        status: 400,
        code: "METHOD_ALREADY_SELECTED",
      };
    }
    return {
      ok: true,
      alreadySelected: true,
      procurement: serializeProcurement(existingProcurement),
      nextProcessQueued: METHOD_PROCESS_BY_ENUM[existingMethod || method]?.code || methodMeta.code,
      nextProcessStarted: true,
      workflow: null,
    };
  }

  if (req.procurementMethod) {
    const stored = String(req.procurementMethod).toUpperCase();
    if (stored !== method) {
      return {
        ok: false,
        error: `A procurement method (${req.procurementMethod}) has already been recommended for this requisition.`,
        status: 400,
        code: "METHOD_ALREADY_SELECTED",
      };
    }
    // Method already on the requisition from Form 5 Part II / PDU recommendation — proceed.
  }

  if (!req.financialYear?.isActive) {
    return {
      ok: false,
      error:
        "The financial year on this requisition is not active. Ask the Organization Administrator to activate a valid financial year.",
      status: 400,
      code: "INVALID_FINANCIAL_YEAR",
    };
  }

  if (!req.procurementPlan || req.procurementPlan.status !== "APPROVED") {
    return {
      ok: false,
      error:
        "The linked procurement plan is missing or not approved. An approved plan item is required before procurement can start.",
      status: 400,
      code: "INVALID_PLAN",
    };
  }

  if (!req.procurementPlanItemId || !req.procurementPlanItem) {
    return {
      ok: false,
      error: "This requisition is not linked to a procurement plan item.",
      status: 400,
      code: "INVALID_PLAN_ITEM",
    };
  }

  if (
    !req.budgetLine ||
    !req.budgetLine.budget ||
    req.budgetLine.budget.status !== OrgBudgetStatus.APPROVED ||
    !req.budgetLine.isActive
  ) {
    return {
      ok: false,
      error:
        "The linked budget line is missing, inactive, or not from an APPROVED budget. Funding must be valid before procurement can start.",
      status: 400,
      code: "INVALID_BUDGET",
    };
  }

  const methodBlocked = await assertMethodProcessesActive(prisma, opts.projectId, method);
  if (methodBlocked) return methodBlocked;

  const procurementNumber = await nextProcurementNumber(
    prisma,
    opts.projectId,
    req.financialYear.label,
  );

  const orgAcademicSlateId =
    req.orgAcademicSlateId || (await resolveSlateIdForOrgCreate(prisma, opts.projectId));

  if (!isTxClient(prisma)) await prepareWorkflowTriggers(prisma, opts.projectId);
  try {
    const outcome = await withTxAbort(() => runInTx(prisma, async (tx) => {
      const created = await tx.projectOrgProcurement.create({
        data: {
          projectId: opts.projectId,
          procurementNumber,
          financialYearId: req.financialYearId,
          departmentId: req.departmentId,
          requisitionId: req.id,
          procurementPlanItemId: req.procurementPlanItemId,
          budgetLineId: req.budgetLineId,
          title: req.title,
          procurementMethod: /** @type {import("@prisma/client").OrgProcurementMethod} */ (method),
          status: OrgProcurementStatus.IN_PROGRESS,
          officerOrgUserId: opts.actorOrgUserId,
          methodSelectedAt: new Date(),
          orgAcademicSlateId,
        },
      });

      await tx.projectOrgRequisition.update({
        where: { id: req.id },
        data: {
          procurementMethod: /** @type {import("@prisma/client").OrgProcurementMethod} */ (method),
        },
      });

      const started = await startWorkflowFromTrigger(tx, {
        projectId: opts.projectId,
        triggerKey: methodMeta.triggerKey,
        entityType: "procurement",
        entityId: created.id,
        procurementId: created.id,
        departmentId: req.departmentId,
        entityTitle: `${created.procurementNumber}: ${created.title}`,
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        actorDepartmentId: opts.actorDepartmentId || null,
      });
      if (!started.ok) {
        throw new TxAbort({
          ok: false,
          error: started.error || `Could not start the ${methodMeta.label} Process.`,
          status: 400,
          code: started.code || "WORKFLOW_START_FAILED",
        });
      }
      return { ok: true, procurement: created, started };
    }));
    if (!outcome.ok) return outcome;
    const { procurement, started } = outcome;

    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ORG_PROCUREMENT_CREATED,
      actorUserId: null,
      meta: withAcademicAuditMeta(
        {
          projectId: opts.projectId,
          procurementId: procurement.id,
          procurementNumber: procurement.procurementNumber,
          requisitionId: req.id,
          procurementMethod: method,
          actorOrgUserId: opts.actorOrgUserId,
          actorRoleName: opts.actorRoleName,
          departmentId: req.departmentId,
        },
        orgAcademicSlateId ? await resolveCurrentOrgSlate(prisma, opts.projectId) : null,
      ),
    });

    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ORG_PROCUREMENT_METHOD_SELECTED,
      actorUserId: null,
      meta: withAcademicAuditMeta(
        {
          projectId: opts.projectId,
          procurementId: procurement.id,
          procurementMethod: method,
          nextProcessQueued: methodMeta.code,
          nextProcessStarted: true,
          actorOrgUserId: opts.actorOrgUserId,
          actorRoleName: opts.actorRoleName,
        },
        orgAcademicSlateId ? await resolveCurrentOrgSlate(prisma, opts.projectId) : null,
      ),
    });

    if (method === "MICRO") {
      const partII = /** @type {any} */ (req.form5PartII);
      const selected = Array.isArray(partII?.shortlist) ? partII.shortlist[0] : null;
      await notifyProvider(prisma, {
        projectId: opts.projectId,
        providerId: selected?.id ? String(selected.id) : null,
        procurementId: procurement.id,
        title: `You have been selected: ${procurement.procurementNumber}`,
        body: `${procurement.title}. A purchase instruction will follow.`,
      });
    }

    const full = await prisma.projectOrgProcurement.findUnique({
      where: { id: procurement.id },
      include: procurementInclude,
    });

    return {
      ok: true,
      procurement: serializeProcurement(full),
      nextProcessQueued: methodMeta.code,
      nextProcessStarted: true,
      workflow: {
        instanceId: started.instance?.id,
        processName: started.processName,
        tasksCreated: started.tasks?.length || 0,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "Could not create procurement.",
      status: 500,
    };
  }
}
