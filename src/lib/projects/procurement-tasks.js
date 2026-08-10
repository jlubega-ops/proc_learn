import {
  OrgWorkflowDecision,
  OrgWorkflowTaskStatus,
  OrgProcurementStatus,
  OrgSolicitationType,
  OrgSolicitationStatus,
  OrgOfferType,
} from "@prisma/client";
import { completeWorkflowTask, computeBudgetAvailability } from "@/lib/projects/workflow-engine";
import { issuePurchaseInstruction } from "@/lib/projects/purchase-instructions";
import { createOrGetSupplier } from "@/lib/projects/suppliers";
import {
  getOrCreateDraftSolicitation,
  advanceSolicitationStatus,
  issueSolicitation,
  receiveOffer,
  openSolicitation,
  enforceClosingDatePassed,
  closeSolicitation,
} from "@/lib/projects/solicitations";
import { actOnProcurementLifecycle } from "@/lib/projects/procurement-lifecycle-actions";
import { getLatestAward } from "@/lib/projects/awards";
import { listDeliveries } from "@/lib/projects/deliveries";
import { listInvoices } from "@/lib/projects/invoices";
import { listPayments } from "@/lib/projects/payments";

/**
 * Step-title matchers keyed to the exact wording used in the Micro/Quotation/
 * Tender templates (see `process-catalogue.js` `BASELINE_PROCESS_TEMPLATES`).
 * Task titles are stored as `"<step description>: <procurement number> — <title>"`,
 * so anchoring at the start of the string is enough to identify the step.
 */
const STEP = {
  MICRO_RAISE: /^raise micro procurement request/i,
  MICRO_CONFIRM_BUDGET: /^confirm budget/i,
  MICRO_ISSUE_PI: /^issue purchase instruction/i,

  RFQ_PREPARE: /^prepare rfq documents/i,
  RFQ_REVIEW: /^review rfq documents/i,
  RFQ_APPROVE: /^approve rfq documents/i,
  RFQ_ISSUE: /^issue rfqs to suppliers/i,
  RFQ_RECEIVE: /^receive quotations/i,
  RFQ_CLOSE: /^close\/lock quotation submission|^close.?lock quotation/i,
  RFQ_OPEN: /^open quotations/i,
  RFQ_NOMINATE_EVAL: /^nominate evaluation committee/i,
  RFQ_APPROVE_EVAL_COMMITTEE: /^approve evaluation committee/i,
  RFQ_TECH_EVAL: /^technical evaluation/i,
  RFQ_FIN_EVAL: /^financial evaluation/i,
  RFQ_PREPARE_EVAL: /^prepare evaluation report/i,
  RFQ_REVIEW_EVAL: /^review evaluation report/i,
  RFQ_APPROVE_EVAL: /^approve evaluation report/i,
  RFQ_PREPARE_AWARD: /^prepare award recommendation/i,
  RFQ_REVIEW_AWARD: /^review award recommendation/i,
  RFQ_APPROVE_AWARD: /^approve award$/i,
  RFQ_COMMUNICATE_AWARD: /^communicate award/i,
  RFQ_PREPARE_LPO: /^prepare lpo/i,
  RFQ_APPROVE_LPO: /^approve\/sign lpo|^approve.?sign lpo/i,
  RFQ_ISSUE_LPO: /^issue lpo/i,
  RFQ_ACCEPT_SUPPLIER: /^confirm supplier acceptance/i,
  RECORD_DELIVERY: /^record delivery/i,
  VERIFY_DELIVERY: /^verify delivery|^verify\/accept delivery/i,
  CERTIFY_DELIVERY: /^certify delivery|^inspection\/acceptance/i,
  RECEIVE_INVOICE: /^receive\/record invoice|^receive.?record invoice|^process invoice|^invoice$/i,
  VERIFY_INVOICE: /^verify invoice|^invoice verification/i,
  APPROVE_PAYMENT: /^approve payment|^payment approval/i,
  RECORD_PAYMENT: /^record payment|^payment recording/i,
  CLOSE_PROCUREMENT: /^close procurement|^procurement closure/i,

  MICRO_CONFIRM_SUPPLIER: /^confirm supplier$/i,

  TENDER_PREPARE: /^prepare tender documents/i,
  TENDER_REVIEW: /^review tender documents/i,
  TENDER_APPROVE: /^approve tender documents/i,
  TENDER_ADVERTISE: /^advertise tender/i,
  TENDER_RECEIVE: /^receive bids/i,
  TENDER_CLOSE: /^close tender submission/i,
  TENDER_OPEN: /^open bids/i,
  TENDER_FORWARD: /^forward bids for evaluation/i,
};

/**
 * Act on a workflow task whose instance is linked to a Procurement (post-requisition
 * business record), rather than a requisition/plan/budget. Handles the
 * Micro/Quotation/Tender business steps and otherwise defers to the generic
 * workflow engine for plain approve/return/reject progression.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   taskId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   actorDepartmentId?: string | null;
 *   decision: import("@prisma/client").OrgWorkflowDecision;
 *   comment?: string | null;
 *   body?: any;
 * }} opts
 */
export async function actOnProcurementTask(prisma, opts) {
  const body = opts.body || {};

  const taskPreview = await prisma.projectOrgWorkflowTask.findUnique({
    where: { id: opts.taskId },
    select: {
      id: true,
      title: true,
      status: true,
      assigneeOrgUserId: true,
      processFlowItem: { select: { actionKey: true } },
      instance: { select: { id: true, projectId: true, procurementId: true, requisitionId: true } },
    },
  });

  if (!taskPreview?.instance?.procurementId) {
    return { ok: false, error: "This task is not linked to a procurement.", status: 400 };
  }
  if (taskPreview.status !== OrgWorkflowTaskStatus.PENDING) {
    return {
      ok: false,
      error: "This task has already been completed.",
      code: "TASK_ALREADY_COMPLETED",
      status: 409,
    };
  }

  const projectId = taskPreview.instance.projectId;
  const procurementId = taskPreview.instance.procurementId;
  const title = String(taskPreview.title || "");
  const decision = opts.decision;
  const isPositive =
    decision === OrgWorkflowDecision.COMPLETE ||
    decision === OrgWorkflowDecision.APPROVE ||
    decision === OrgWorkflowDecision.SUBMIT ||
    decision === OrgWorkflowDecision.VERIFY;

  const complete = (metadata) =>
    completeWorkflowTask(prisma, {
      taskId: opts.taskId,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      actorDepartmentId: opts.actorDepartmentId || null,
      decision: opts.decision,
      comment: opts.comment,
      metadata: metadata || null,
    });

  /** Resolve a supplier id from an explicit id or an inline "new supplier" payload. */
  const resolveSupplierId = async (rawSupplierId, inlineSupplier) => {
    const supplierId = typeof rawSupplierId === "string" ? rawSupplierId.trim() : "";
    if (supplierId) return { ok: true, supplierId };
    if (inlineSupplier && typeof inlineSupplier === "object") {
      const created = await createOrGetSupplier(prisma, {
        projectId,
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        body: inlineSupplier,
      });
      if (!created.ok) return created;
      return { ok: true, supplierId: created.supplier.id };
    }
    return null;
  };

  // ---------------------------------------------------------------------
  // MICRO PROCUREMENT
  // ---------------------------------------------------------------------

  if (STEP.MICRO_CONFIRM_BUDGET.test(title) && decision === OrgWorkflowDecision.VERIFY) {
    const procurement = await prisma.projectOrgProcurement.findFirst({
      where: { id: procurementId, projectId },
      include: { requisition: { include: { budgetLine: true } } },
    });
    const budgetLine = procurement?.requisition?.budgetLine;
    const requested = Number(procurement?.requisition?.estimatedTotalValue ?? 0);
    if (budgetLine) {
      // Funds were already committed when the Accounting Officer approved the requisition.
      // Confirm Budget verifies the approved line still covers that value — do not subtract
      // the amount again from available balance (that would double-count).
      const approved = Number(budgetLine.approvedAmount ?? 0);
      const committed = Number(budgetLine.committedAmount ?? 0);
      const funding = {
        approvedAmount: approved,
        committedAmount: committed,
        availableBalance: approved - committed,
        requestedAmount: requested,
        projectedBalance: approved - committed,
        sufficient: approved + 0.009 >= requested && committed + 0.009 >= requested,
      };
      if (!funding.sufficient) {
        return {
          ok: false,
          error:
            "Budget confirmation failed. The approved budget line does not cover this micro procurement (funds may not have been committed at requisition approval).",
          code: "INSUFFICIENT_FUNDS",
          status: 400,
          funding,
          fieldErrors: {
            comment: "Return or flag an exception — the budget line does not cover this requirement.",
          },
        };
      }
    }
    return complete({ fundingConfirmed: true, requestedAmount: requested });
  }

  if (STEP.MICRO_ISSUE_PI.test(title) && isPositive) {
    const resolved = await resolveSupplierId(body.supplierId, body.supplier);
    if (!resolved) {
      return {
        ok: false,
        error: "Choose a registered supplier or add a new supplier to issue the purchase instruction.",
        status: 400,
        fieldErrors: { supplierId: "Choose or add a supplier." },
      };
    }
    if (!resolved.ok) return resolved;

    const issued = await issuePurchaseInstruction(prisma, {
      projectId,
      procurementId,
      supplierId: resolved.supplierId,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      remarks: typeof body.remarks === "string" ? body.remarks : null,
    });
    if (!issued.ok) return issued;

    const result = await complete({
      purchaseInstructionId: issued.purchaseInstruction.id,
      instructionNumber: issued.purchaseInstruction.instructionNumber,
      supplierId: resolved.supplierId,
      amount: issued.purchaseInstruction.amount,
    });
    if (!result.ok) {
      return {
        ...result,
        purchaseInstruction: issued.purchaseInstruction,
        warning:
          "The purchase instruction was issued, but the task could not be closed automatically. Refresh My Tasks to continue.",
      };
    }
    // Micro procurements remain IN_PROGRESS after the instruction is issued —
    // closure (delivery/invoicing/payment) is handled in a later phase.
    return { ...result, purchaseInstruction: issued.purchaseInstruction };
  }

  // ---------------------------------------------------------------------
  // QUOTATION (RFQ)
  // ---------------------------------------------------------------------

  if (STEP.RFQ_PREPARE.test(title) && isPositive) {
    const created = await getOrCreateDraftSolicitation(prisma, {
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.RFQ,
      title: typeof body.title === "string" ? body.title : null,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!created.ok) return created;
    const result = await complete({ solicitationId: created.solicitation.id });
    return { ...result, solicitation: created.solicitation };
  }

  if (STEP.RFQ_REVIEW.test(title) && isPositive) {
    const advanced = await advanceSolicitationStatus(prisma, {
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.RFQ,
      toStatus: OrgSolicitationStatus.REVIEW,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!advanced.ok) return advanced;
    const result = await complete({ solicitationId: advanced.solicitation.id });
    return { ...result, solicitation: advanced.solicitation };
  }

  if (STEP.RFQ_APPROVE.test(title) && isPositive) {
    const advanced = await advanceSolicitationStatus(prisma, {
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.RFQ,
      toStatus: OrgSolicitationStatus.APPROVED,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!advanced.ok) return advanced;
    const result = await complete({ solicitationId: advanced.solicitation.id });
    return { ...result, solicitation: advanced.solicitation };
  }

  if (STEP.RFQ_ISSUE.test(title) && isPositive) {
    const issuedSol = await issueSolicitation(prisma, {
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.RFQ,
      inviteSupplierIds: body.inviteSupplierIds,
      closingDate: body.closingDate,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!issuedSol.ok) return issuedSol;

    await prisma.projectOrgProcurement.update({
      where: { id: procurementId },
      data: { status: OrgProcurementStatus.SOLICITATION },
    });

    const result = await complete({ solicitationId: issuedSol.solicitation.id });
    return { ...result, solicitation: issuedSol.solicitation };
  }

  if (STEP.RFQ_RECEIVE.test(title)) {
    return handleReceiveStep(prisma, {
      opts,
      body,
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.RFQ,
      isPositive,
      complete,
      resolveSupplierId,
    });
  }

  if (STEP.RFQ_CLOSE.test(title) && isPositive) {
    const gate = await enforceClosingDatePassed(prisma, {
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.RFQ,
    });
    if (!gate.ok) return gate;
    return complete({ solicitationId: gate.solicitation.id });
  }

  if (STEP.RFQ_OPEN.test(title) && isPositive) {
    const opened = await openSolicitation(prisma, {
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.RFQ,
      finalize: true,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!opened.ok) return opened;

    await prisma.projectOrgProcurement.update({
      where: { id: procurementId },
      data: { status: OrgProcurementStatus.EVALUATION },
    });

    const result = await complete({ solicitationId: opened.solicitation.id });
    return { ...result, solicitation: opened.solicitation };
  }

  // ---------------------------------------------------------------------
  // TENDER
  // ---------------------------------------------------------------------

  if (STEP.TENDER_PREPARE.test(title) && isPositive) {
    const created = await getOrCreateDraftSolicitation(prisma, {
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.TENDER,
      title: typeof body.title === "string" ? body.title : null,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!created.ok) return created;
    const result = await complete({ solicitationId: created.solicitation.id });
    return { ...result, solicitation: created.solicitation };
  }

  if (STEP.TENDER_REVIEW.test(title) && isPositive) {
    const advanced = await advanceSolicitationStatus(prisma, {
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.TENDER,
      toStatus: OrgSolicitationStatus.REVIEW,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!advanced.ok) return advanced;
    const result = await complete({ solicitationId: advanced.solicitation.id });
    return { ...result, solicitation: advanced.solicitation };
  }

  if (STEP.TENDER_APPROVE.test(title) && isPositive) {
    const advanced = await advanceSolicitationStatus(prisma, {
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.TENDER,
      toStatus: OrgSolicitationStatus.APPROVED,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!advanced.ok) return advanced;
    const result = await complete({ solicitationId: advanced.solicitation.id });
    return { ...result, solicitation: advanced.solicitation };
  }

  if (STEP.TENDER_ADVERTISE.test(title) && isPositive) {
    const issuedSol = await issueSolicitation(prisma, {
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.TENDER,
      inviteSupplierIds: body.inviteSupplierIds,
      closingDate: body.closingDate,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!issuedSol.ok) return issuedSol;

    await prisma.projectOrgProcurement.update({
      where: { id: procurementId },
      data: { status: OrgProcurementStatus.SOLICITATION },
    });

    const result = await complete({ solicitationId: issuedSol.solicitation.id });
    return { ...result, solicitation: issuedSol.solicitation };
  }

  if (STEP.TENDER_RECEIVE.test(title)) {
    return handleReceiveStep(prisma, {
      opts,
      body,
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.TENDER,
      isPositive,
      complete,
      resolveSupplierId,
    });
  }

  if (STEP.TENDER_CLOSE.test(title) && isPositive) {
    const gate = await enforceClosingDatePassed(prisma, {
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.TENDER,
    });
    if (!gate.ok) return gate;
    return complete({ solicitationId: gate.solicitation.id });
  }

  if (STEP.TENDER_OPEN.test(title) && isPositive) {
    const opened = await openSolicitation(prisma, {
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.TENDER,
      finalize: false,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!opened.ok) return opened;
    const result = await complete({ solicitationId: opened.solicitation.id });
    return { ...result, solicitation: opened.solicitation };
  }

  if (STEP.TENDER_FORWARD.test(title) && isPositive) {
    const closed = await closeSolicitation(prisma, {
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.TENDER,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!closed.ok) return closed;

    await prisma.projectOrgProcurement.update({
      where: { id: procurementId },
      data: { status: OrgProcurementStatus.EVALUATION },
    });

    const result = await complete({ solicitationId: closed.solicitation.id });
    return { ...result, solicitation: closed.solicitation };
  }

  // ---------------------------------------------------------------------
  // Shared post-solicitation lifecycle bridges (Micro / Quotation / Tender)
  // ------------------------------------------------------------------

  if (STEP.MICRO_CONFIRM_SUPPLIER.test(title) && isPositive) {
    const pi = await prisma.projectOrgPurchaseInstruction.findFirst({
      where: { projectId, procurementId, status: "ISSUED" },
      include: { supplier: true },
    });
    if (!pi?.supplierId) {
      return {
        ok: false,
        error:
          "Confirm the supplier on an issued Purchase Instruction before completing this step.",
        status: 400,
      };
    }
    return complete({ supplierId: pi.supplierId, purchaseInstructionId: pi.id });
  }

  if (
    (STEP.RFQ_NOMINATE_EVAL.test(title) || STEP.RFQ_APPROVE_EVAL_COMMITTEE.test(title)) &&
    isPositive
  ) {
    const committeeId =
      typeof body.committeeId === "string" ? body.committeeId.trim() : "";
    if (!committeeId) {
      return {
        ok: false,
        error:
          "Choose an Evaluation committee (committeeId) for this procurement before continuing.",
        status: 400,
        fieldErrors: { committeeId: "Choose an evaluation committee." },
      };
    }
    const committee = await prisma.projectOrgCommittee.findFirst({
      where: {
        id: committeeId,
        projectId,
        isActive: true,
        committeeType: "EVALUATION",
      },
      include: { _count: { select: { members: true } } },
    });
    if (!committee || (committee._count?.members || 0) < 1) {
      return {
        ok: false,
        error:
          "Nominate an active Evaluation committee that has at least one active member.",
        status: 400,
      };
    }
    return complete({ committeeId: committee.id, committeeName: committee.name });
  }

  if (
    (STEP.RFQ_TECH_EVAL.test(title) ||
      STEP.RFQ_FIN_EVAL.test(title) ||
      STEP.RFQ_PREPARE_EVAL.test(title) ||
      STEP.RFQ_REVIEW_EVAL.test(title) ||
      STEP.RFQ_PREPARE_AWARD.test(title) ||
      STEP.RFQ_REVIEW_AWARD.test(title)) &&
    isPositive
  ) {
    // Educational progression steps; domain award still requires approved evaluation report.
    return complete({ educationalCheckpoint: true });
  }

  if ((STEP.RFQ_APPROVE_EVAL.test(title) || /approve evaluation\/recommendation/i.test(title)) && isPositive) {
    if (body.evaluationReportId && (body.decision || opts.decision === OrgWorkflowDecision.APPROVE)) {
      const { decideEvaluationReport } = await import("@/lib/projects/evaluation");
      const decided = await decideEvaluationReport(prisma, {
        projectId,
        evaluationReportId: String(body.evaluationReportId),
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        decision: body.decision || "APPROVE",
        comment: opts.comment || "Approved.",
      });
      if (!decided.ok) return decided;
      return complete({ evaluationReportId: body.evaluationReportId });
    }
    return complete({ educationalCheckpoint: true });
  }

  if (STEP.RFQ_APPROVE_AWARD.test(title) && isPositive) {
    const created = await actOnProcurementLifecycle(prisma, {
      projectId,
      procurementId,
      action: "create_award",
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      actorDepartmentId: opts.actorDepartmentId,
      body: { approvalReference: body.approvalReference || null },
    });
    if (!created.ok && created.code !== "AWARD_ALREADY_EXISTS") return created;
    return complete({ awardId: created.award?.id || null });
  }

  if (STEP.RFQ_COMMUNICATE_AWARD.test(title) && isPositive) {
    const award =
      (typeof body.awardId === "string" && body.awardId) ||
      (await getLatestAward(prisma, projectId, procurementId))?.id;
    const out = await actOnProcurementLifecycle(prisma, {
      projectId,
      procurementId,
      action: "communicate_award",
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      body: { awardId: award },
    });
    if (!out.ok) return out;
    return complete({ awardId: award });
  }

  if (
    (STEP.RFQ_PREPARE_LPO.test(title) || /^prepare contract$/i.test(title)) &&
    isPositive
  ) {
    const action = /contract/i.test(title) ? "create_contract" : "create_lpo";
    const out = await actOnProcurementLifecycle(prisma, {
      projectId,
      procurementId,
      action,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      body,
    });
    if (!out.ok && out.code !== "LPO_EXISTS" && out.code !== "CONTRACT_EXISTS") return out;
    return complete({ document: out.lpo || out.contract || null });
  }

  if ((STEP.RFQ_APPROVE_LPO.test(title) || /^sign\/approve contract/i.test(title)) && isPositive) {
    if (body.lpoId) {
      const out = await actOnProcurementLifecycle(prisma, {
        projectId,
        procurementId,
        action: "approve_lpo",
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        body: { lpoId: body.lpoId },
      });
      if (!out.ok) return out;
      return complete({ lpoId: body.lpoId });
    }
    if (body.contractId) {
      const out = await actOnProcurementLifecycle(prisma, {
        projectId,
        procurementId,
        action: "approve_contract",
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        body: { contractId: body.contractId },
      });
      if (!out.ok) return out;
      return complete({ contractId: body.contractId });
    }
    return {
      ok: false,
      error: "Provide lpoId or contractId to approve this document.",
      status: 400,
    };
  }

  if ((STEP.RFQ_ISSUE_LPO.test(title) || /^issue contract$/i.test(title)) && isPositive) {
    if (body.lpoId) {
      const out = await actOnProcurementLifecycle(prisma, {
        projectId,
        procurementId,
        action: "issue_lpo",
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        body: { lpoId: body.lpoId },
      });
      if (!out.ok) return out;
      return complete({ lpoId: body.lpoId });
    }
    if (body.contractId) {
      let out = await actOnProcurementLifecycle(prisma, {
        projectId,
        procurementId,
        action: "sign_contract",
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        body: { contractId: body.contractId },
      });
      if (!out.ok && !/signed|already/i.test(String(out.error || ""))) {
        // try issue directly if already signed
      }
      out = await actOnProcurementLifecycle(prisma, {
        projectId,
        procurementId,
        action: "issue_contract",
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        body: { contractId: body.contractId },
      });
      if (!out.ok) return out;
      return complete({ contractId: body.contractId });
    }
    return { ok: false, error: "Provide lpoId or contractId to issue.", status: 400 };
  }

  if ((STEP.RFQ_ACCEPT_SUPPLIER.test(title) || /^supplier acceptance$/i.test(title)) && isPositive) {
    if (body.lpoId) {
      const out = await actOnProcurementLifecycle(prisma, {
        projectId,
        procurementId,
        action: "accept_lpo",
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        body: { lpoId: body.lpoId },
      });
      if (!out.ok) return out;
      return complete({ lpoId: body.lpoId });
    }
    if (body.awardId) {
      const out = await actOnProcurementLifecycle(prisma, {
        projectId,
        procurementId,
        action: "accept_award",
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        body: { awardId: body.awardId },
      });
      if (!out.ok) return out;
      return complete({ awardId: body.awardId });
    }
    return complete({ educationalCheckpoint: true });
  }

  if ((STEP.RECORD_DELIVERY.test(title) || /^delivery$/i.test(title)) && isPositive) {
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return {
        ok: false,
        error: "Provide delivery lines (itemName + receivedQuantity) to record delivery.",
        status: 400,
        fieldErrors: { lines: "Add at least one delivery line." },
      };
    }
    const out = await actOnProcurementLifecycle(prisma, {
      projectId,
      procurementId,
      action: "record_delivery",
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      actorDepartmentId: opts.actorDepartmentId,
      body,
    });
    if (!out.ok) return out;
    return complete({ deliveryId: out.delivery?.id });
  }

  if (
    (STEP.VERIFY_DELIVERY.test(title) ||
      STEP.CERTIFY_DELIVERY.test(title) ||
      /verify\/accept delivery/i.test(title)) &&
    isPositive
  ) {
    const deliveryId =
      typeof body.deliveryId === "string"
        ? body.deliveryId
        : (await listDeliveries(prisma, projectId, procurementId)).slice(-1)[0]?.id;
    if (!deliveryId || !Array.isArray(body.lineDecisions) || body.lineDecisions.length === 0) {
      return {
        ok: false,
        error:
          "Provide deliveryId and lineDecisions (acceptedQuantity / rejectedQuantity) to inspect delivery.",
        status: 400,
      };
    }
    const out = await actOnProcurementLifecycle(prisma, {
      projectId,
      procurementId,
      action: "record_inspection",
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      actorDepartmentId: opts.actorDepartmentId,
      body: {
        deliveryId,
        resultNotes: body.resultNotes || opts.comment || null,
        lineDecisions: body.lineDecisions,
        committeeId: body.committeeId || null,
        committeeRole: body.committeeRole || null,
      },
    });
    if (!out.ok) return out;
    return complete({ deliveryId });
  }

  if (STEP.RECEIVE_INVOICE.test(title) && isPositive) {
    if (body.amount == null) {
      return {
        ok: false,
        error: "Provide the invoice amount to raise an invoice against this procurement.",
        status: 400,
        fieldErrors: { amount: "Enter the invoice amount." },
      };
    }
    const out = await actOnProcurementLifecycle(prisma, {
      projectId,
      procurementId,
      action: "create_invoice",
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      actorDepartmentId: opts.actorDepartmentId,
      body,
    });
    if (!out.ok) return out;
    return complete({ invoiceId: out.invoice?.id });
  }

  if (STEP.VERIFY_INVOICE.test(title) && isPositive) {
    const invoiceId =
      typeof body.invoiceId === "string"
        ? body.invoiceId
        : (await listInvoices(prisma, projectId, procurementId)).slice(-1)[0]?.id;
    if (!invoiceId) {
      return { ok: false, error: "No invoice is available to certify/verify.", status: 400 };
    }
    let out = await actOnProcurementLifecycle(prisma, {
      projectId,
      procurementId,
      action: "certify_invoice",
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      body: { invoiceId },
    });
    if (!out.ok && !/certified|only a received/i.test(String(out.error || ""))) return out;
    out = await actOnProcurementLifecycle(prisma, {
      projectId,
      procurementId,
      action: "verify_invoice",
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      body: { invoiceId },
    });
    if (!out.ok) return out;
    return complete({ invoiceId });
  }

  if (STEP.APPROVE_PAYMENT.test(title) && isPositive) {
    let paymentId = typeof body.paymentId === "string" ? body.paymentId : null;
    if (!paymentId && body.amount != null) {
      const invoiceId =
        typeof body.invoiceId === "string"
          ? body.invoiceId
          : (await listInvoices(prisma, projectId, procurementId)).slice(-1)[0]?.id;
      const created = await actOnProcurementLifecycle(prisma, {
        projectId,
        procurementId,
        action: "create_payment",
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        body: { invoiceId, amount: body.amount, paymentReference: body.paymentReference },
      });
      if (!created.ok) return created;
      paymentId = created.payment?.id;
    }
    if (!paymentId) {
      paymentId = (await listPayments(prisma, projectId, procurementId)).slice(-1)[0]?.id;
    }
    if (!paymentId) {
      return {
        ok: false,
        error: "Raise a payment (amount + verified invoice) before approving payment.",
        status: 400,
      };
    }
    const out = await actOnProcurementLifecycle(prisma, {
      projectId,
      procurementId,
      action: "approve_payment",
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      body: { paymentId },
    });
    if (!out.ok) return out;
    return complete({ paymentId });
  }

  if (STEP.RECORD_PAYMENT.test(title) && isPositive) {
    const paymentId =
      typeof body.paymentId === "string"
        ? body.paymentId
        : (await listPayments(prisma, projectId, procurementId)).slice(-1)[0]?.id;
    if (!paymentId) {
      return { ok: false, error: "No approved payment is available to mark as paid.", status: 400 };
    }
    const out = await actOnProcurementLifecycle(prisma, {
      projectId,
      procurementId,
      action: "mark_payment_paid",
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      body: { paymentId, paymentDate: body.paymentDate || null },
    });
    if (!out.ok) return out;
    return complete({ paymentId });
  }

  if (STEP.CLOSE_PROCUREMENT.test(title) && isPositive) {
    const out = await actOnProcurementLifecycle(prisma, {
      projectId,
      procurementId,
      action: "close_procurement",
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      body: { remarks: opts.comment || body.remarks || null },
    });
    if (!out.ok) return out;
    return complete({ closed: true });
  }

  // ---------------------------------------------------------------------
  // Everything else (Raise Micro Procurement Request, Verify Requirement,
  // Approve Micro Procurement — administrative steps with no dedicated
  // business object) just progresses the generic engine.
  // ---------------------------------------------------------------------
  return complete();
}

/**
 * Shared logic for "Receive Quotations" / "Receive Bids": lets the officer
 * record offers one at a time without finalizing the step, then finalize
 * (complete the task, advancing the workflow) once ready.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   opts: any;
 *   body: any;
 *   projectId: string;
 *   procurementId: string;
 *   solicitationType: string;
 *   isPositive: boolean;
 *   complete: (metadata?: object | null) => Promise<any>;
 *   resolveSupplierId: (rawSupplierId: unknown, inlineSupplier: unknown) => Promise<any>;
 * }} p
 */
async function handleReceiveStep(prisma, p) {
  const { opts, body, projectId, procurementId, solicitationType, isPositive, complete, resolveSupplierId } = p;

  if (body.offer && typeof body.offer === "object") {
    const resolved = await resolveSupplierId(body.offer.supplierId, body.offer.supplier);
    if (!resolved) {
      return {
        ok: false,
        error: "Choose the supplier this offer came from, or add a new supplier.",
        status: 400,
        fieldErrors: { supplierId: "Choose or add a supplier." },
      };
    }
    if (!resolved.ok) return resolved;

    const amount = body.offer.amount ?? body.quotationAmount;
    const added = await receiveOffer(prisma, {
      projectId,
      procurementId,
      solicitationType,
      supplierId: resolved.supplierId,
      amount,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!added.ok) return added;

    if (!body.finalize) {
      return { ok: true, offerAdded: true, offer: added.offer, taskStatus: "PENDING" };
    }
  }

  if (!isPositive) {
    // RETURN / REJECT / FLAG_EXCEPTION — no offer requirement, defer to the
    // generic engine to suspend/cancel this procurement's workflow.
    return complete();
  }

  const count = await prisma.projectOrgOffer.count({
    where: { procurementId, offerType: solicitationType === OrgSolicitationType.RFQ ? "QUOTATION" : "BID" },
  });
  if (count === 0) {
    return {
      ok: false,
      error: `Record at least one ${solicitationType === OrgSolicitationType.RFQ ? "quotation" : "bid"} before completing this step.`,
      status: 400,
    };
  }

  return complete();
}
