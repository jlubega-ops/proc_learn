import {
  OrgWorkflowDecision,
  OrgWorkflowTaskStatus,
  OrgProcurementStatus,
  OrgSolicitationType,
  OrgSolicitationStatus,
  OrgOfferType,
} from "@prisma/client";
import { completeWorkflowTask, computeBudgetAvailability } from "@/lib/projects/workflow-engine";
import {
  afterPurchaseInstructionIssued,
  issuePurchaseInstruction,
} from "@/lib/projects/purchase-instructions";
import { assessProviderSelection, createOrGetProvider } from "@/lib/projects/providers";
import {
  getOrCreateDraftSolicitation,
  advanceSolicitationStatus,
  issueSolicitation,
  receiveOffer,
  openSolicitation,
  lockSolicitationSubmissions,
  reopenSolicitationSubmissions,
  findSolicitationForProcurement,
  closeSolicitation,
} from "@/lib/projects/solicitations";
import { actOnProcurementLifecycle } from "@/lib/projects/procurement-lifecycle-actions";
import { getLatestAward } from "@/lib/projects/awards";
import { listDeliveries } from "@/lib/projects/deliveries";
import { listInvoices } from "@/lib/projects/invoices";
import { listPayments } from "@/lib/projects/payments";
import { generateQuotes, loadQuotePool } from "@/lib/projects/provider-auto-responses";
import { askOfferClarification } from "@/lib/projects/offer-clarifications";
import { MIN_RFQ_PROVIDERS } from "@/lib/projects/procurement-thresholds";
import {
  committeeTypeForWorkflowRole,
  isCommitteeWorkflowRole,
  requireCommitteeMembership,
} from "@/lib/projects/committee-context";
import {
  findPendingRecommendation,
  recommendationStage,
} from "@/lib/projects/procurement-recommendations";
import {
  isRecommendationDecisionTask,
  mayRecommendToContractsCommittee,
} from "@/lib/projects/procurement-recommendation-options";

/**
 * Step-title matchers keyed to the exact wording used in the Micro/Quotation/
 * Tender templates (see `process-catalogue.js` `BASELINE_PROCESS_TEMPLATES`).
 * Task titles are stored as `"<step description>: <procurement number> — <title>"`,
 * so anchoring at the start of the string is enough to identify the step.
 */
const STEP = {
  MICRO_ISSUE_PI: /^issue purchase instruction/i,

  RFQ_PREPARE: /^prepare rfq documents/i,
  RFQ_REVIEW: /^review rfq documents/i,
  RFQ_APPROVE: /^approve rfq documents/i,
  RFQ_ISSUE: /^issue rfqs to suppliers/i,
  RFQ_RECEIVE: /^receive quotations/i,
  RFQ_CLOSE: /^close\/lock quotation submission|^close.?lock quotation/i,
  RFQ_OPEN: /^open quotations/i,
  RFQ_TECH_EVAL: /^technical evaluation/i,
  RFQ_FIN_EVAL: /^financial evaluation/i,
  RFQ_PREPARE_EVAL: /^prepare evaluation report/i,
  RFQ_REVIEW_EVAL: /^review evaluation report/i,
  RFQ_APPROVE_EVAL: /^approve evaluation report/i,
  TENDER_POST_QUAL: /^post-qualification/i,
  TENDER_APPROVE_RECOMMENDATION: /^approve evaluation\/recommendation/i,
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
 * The procurement's live LPO / contract ids, so contract-stage tasks act on them without the client passing ids.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 * @param {Record<string, any>} body
 */
async function orderDocumentIds(prisma, projectId, procurementId, body) {
  if (body.lpoId || body.contractId) return { lpoId: body.lpoId || null, contractId: body.contractId || null };
  const where = { projectId, procurementId, status: { not: "CANCELLED" } };
  const [lpo, contract] = await Promise.all([
    prisma.projectOrgLpo.findFirst({ where, orderBy: { createdAt: "desc" }, select: { id: true } }),
    prisma.projectOrgContract.findFirst({ where, orderBy: { createdAt: "desc" }, select: { id: true } }),
  ]);
  return { lpoId: lpo?.id || null, contractId: contract?.id || null };
}

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
 *   committeeId?: string | null;
 *   committeeRole?: string | null;
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
      requiredRoleName: true,
      status: true,
      stepNumber: true,
      processFlowItemId: true,
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
  // Titles are "<step>: <PROC no>: <procurement title>" — match on the step part only.
  const title = String(taskPreview.title || "").split(":")[0].trim();
  const decision = opts.decision;

  if (isRecommendationDecisionTask(title)) {
    return {
      ok: false,
      error: "Decide the PDU recommendation on the procurement page.",
      status: 400,
    };
  }
  if (await findPendingRecommendation(prisma, { projectId, procurementId })) {
    return {
      ok: false,
      error: "Waiting for the Contracts Committee decision on the PDU recommendation.",
      code: "RECOMMENDATION_PENDING",
      status: 409,
    };
  }
  if (
    (decision === OrgWorkflowDecision.RETURN || decision === OrgWorkflowDecision.REJECT) &&
    !isCommitteeWorkflowRole(taskPreview.requiredRoleName) &&
    (await recommendationStage(prisma, { projectId, procurementId })).allowed
  ) {
    if (mayRecommendToContractsCommittee(opts.actorRoleName)) {
      return {
        ok: false,
        error: "Recommend cancellation to the Contracts Committee instead.",
        status: 400,
      };
    }
    if (decision === OrgWorkflowDecision.REJECT) {
      return {
        ok: false,
        error: "Only the Contracts Committee can cancel before award. Return it instead.",
        status: 400,
      };
    }
  }

  const committeeType = committeeTypeForWorkflowRole(taskPreview.requiredRoleName);
  if (committeeType) {
    if (!opts.committeeId) {
      return {
        ok: false,
        error: `This is ${taskPreview.requiredRoleName} work. Switch to the ${taskPreview.requiredRoleName} (account menu) before acting on it.`,
        code: "COMMITTEE_MODE_REQUIRED",
        status: 403,
      };
    }
    const seat = await requireCommitteeMembership(prisma, {
      projectId,
      orgUserId: opts.actorOrgUserId,
      committeeId: opts.committeeId,
      committeeType,
    });
    if (!seat.ok) return seat;
  }
  const actingCommitteeType = committeeType || null;
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
      committeeId: opts.committeeId || null,
      committeeRole: opts.committeeRole || null,
      metadata: metadata || null,
    });

  /** Resolve a supplier id from an explicit id or an inline "new supplier" payload. */
  const resolveSupplierId = async (rawSupplierId, inlineSupplier) => {
    const supplierId = typeof rawSupplierId === "string" ? rawSupplierId.trim() : "";
    if (supplierId) return { ok: true, supplierId };
    if (inlineSupplier && typeof inlineSupplier === "object") {
      const created = await createOrGetProvider(prisma, {
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

  /** Learning-mode eligibility snapshot recorded on the task (never blocks). */
  const eligibilityFor = async (providerIds, method) => {
    const proc = await prisma.projectOrgProcurement.findFirst({
      where: { id: procurementId, projectId },
      select: { requisition: { select: { category: true } } },
    });
    return assessProviderSelection(prisma, {
      projectId,
      providerIds,
      method,
      category: proc?.requisition?.category || null,
    });
  };

  // ---------------------------------------------------------------------
  // MICRO PROCUREMENT
  // ---------------------------------------------------------------------

  if (STEP.MICRO_ISSUE_PI.test(title) && isPositive) {
    const approvedProc = await prisma.projectOrgProcurement.findFirst({
      where: { id: procurementId, projectId },
      select: { requisition: { select: { form5PartII: true } } },
    });
    const approvedShortlist = Array.isArray(approvedProc?.requisition?.form5PartII?.shortlist)
      ? approvedProc.requisition.form5PartII.shortlist.map((s) => s?.id).filter(Boolean)
      : [];
    if (approvedShortlist.length) {
      const requested = typeof body.supplierId === "string" ? body.supplierId.trim() : "";
      if (requested && !approvedShortlist.includes(requested)) {
        return {
          ok: false,
          error:
            "Only the provider approved by the Contracts Committee can receive this purchase instruction.",
          status: 400,
          fieldErrors: { supplierId: "Use the approved provider." },
        };
      }
      if (!requested) body.supplierId = approvedShortlist[0];
      body.supplier = null;
    }
    const resolved = await resolveSupplierId(body.supplierId, body.supplier);
    if (!resolved) {
      return {
        ok: false,
        error: "Select a supplier from the register and run validation before issuing the purchase instruction.",
        status: 400,
        fieldErrors: { supplierId: "Select a supplier." },
      };
    }
    if (!resolved.ok) return resolved;

    const eligibility = await eligibilityFor([resolved.supplierId], "MICRO");
    if (!eligibility.ok) return eligibility;

    const issued = await issuePurchaseInstruction(prisma, {
      projectId,
      procurementId,
      supplierId: resolved.supplierId,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      remarks: typeof body.remarks === "string" ? body.remarks : null,
      deliveryAddress: typeof body.deliveryAddress === "string" ? body.deliveryAddress : null,
      requiredDeliveryDate: body.requiredDeliveryDate,
      paymentTerms: body.paymentTerms,
      specialInstructions: body.specialInstructions,
    });
    if (!issued.ok) return issued;
    const notifyIssued = () =>
      afterPurchaseInstructionIssued(prisma, {
        projectId,
        procurementId,
        purchaseInstruction: issued.purchaseInstruction,
      });

    const piMeta = {
      purchaseInstructionId: issued.purchaseInstruction.id,
      instructionNumber: issued.purchaseInstruction.instructionNumber,
      supplierId: resolved.supplierId,
      supplierConfirmed: true,
      amount: issued.purchaseInstruction.amount,
      ...(eligibility.warnings.length ? { eligibilityWarnings: eligibility.warnings } : {}),
    };
    // Re-issue after a provider declined is an ad-hoc task outside the step sequence.
    if (!taskPreview.processFlowItemId) {
      const now = new Date();
      await prisma.$transaction([
        prisma.projectOrgWorkflowTask.update({
          where: { id: taskPreview.id },
          data: { status: OrgWorkflowTaskStatus.COMPLETED, completedAt: now },
        }),
        prisma.projectOrgWorkflowAction.create({
          data: {
            projectId,
            instanceId: taskPreview.instance.id,
            taskId: taskPreview.id,
            actorOrgUserId: opts.actorOrgUserId,
            actorRoleName: opts.actorRoleName,
            decision: OrgWorkflowDecision.COMPLETE,
            comment: opts.comment?.trim() || null,
            metadata: { ...piMeta, stepNumber: 0, taskTitle: taskPreview.title },
          },
        }),
      ]);
      await notifyIssued();
      return { ok: true, purchaseInstruction: issued.purchaseInstruction };
    }

    const result = await complete(piMeta);
    await notifyIssued();
    if (!result.ok) {
      return {
        ...result,
        purchaseInstruction: issued.purchaseInstruction,
        warning:
          "The purchase instruction was issued, but the task could not be closed automatically. Refresh My Tasks to continue.",
      };
    }
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
    const submitted = await advanceSolicitationStatus(prisma, {
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.RFQ,
      toStatus: OrgSolicitationStatus.REVIEW,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!submitted.ok) return submitted;
    const result = await complete({ solicitationId: created.solicitation.id });
    return { ...result, solicitation: submitted.solicitation };
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
    const approvedProc = await prisma.projectOrgProcurement.findFirst({
      where: { id: procurementId, projectId },
      select: { requisition: { select: { form5PartII: true } } },
    });
    const approvedShortlist = Array.isArray(approvedProc?.requisition?.form5PartII?.shortlist)
      ? approvedProc.requisition.form5PartII.shortlist.map((s) => s?.id).filter(Boolean)
      : [];
    if (approvedShortlist.length) {
      const requested = Array.isArray(body.inviteSupplierIds)
        ? body.inviteSupplierIds.filter((id) => typeof id === "string" && id.trim())
        : [];
      if (requested.some((id) => !approvedShortlist.includes(id))) {
        return {
          ok: false,
          error: "Only suppliers approved by the Contracts Committee can be invited.",
          status: 400,
          fieldErrors: { inviteSupplierIds: "Use the approved shortlist." },
        };
      }
      body.inviteSupplierIds = approvedShortlist;
    }
    const inviteCount = new Set(Array.isArray(body.inviteSupplierIds) ? body.inviteSupplierIds : []).size;
    const justified = Boolean(String(approvedProc?.requisition?.form5PartII?.shortlistJustification || "").trim());
    if (inviteCount > 0 && inviteCount < MIN_RFQ_PROVIDERS && !justified) {
      return {
        ok: false,
        error: `An RFQ goes to at least ${MIN_RFQ_PROVIDERS} providers unless fewer were justified on the shortlist.`,
        status: 400,
        fieldErrors: { inviteSupplierIds: `Invite at least ${MIN_RFQ_PROVIDERS} providers.` },
      };
    }
    const eligibility = await eligibilityFor(body.inviteSupplierIds, "QUOTATION");
    if (!eligibility.ok) return eligibility;

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

    const result = await complete({
      solicitationId: issuedSol.solicitation.id,
      ...(eligibility.warnings.length ? { eligibilityWarnings: eligibility.warnings } : {}),
    });
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

  if (STEP.RFQ_CLOSE.test(title)) {
    return handleCloseStep(prisma, {
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
    const submitted = await advanceSolicitationStatus(prisma, {
      projectId,
      procurementId,
      solicitationType: OrgSolicitationType.TENDER,
      toStatus: OrgSolicitationStatus.REVIEW,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!submitted.ok) return submitted;
    const result = await complete({ solicitationId: created.solicitation.id });
    return { ...result, solicitation: submitted.solicitation };
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

  if (STEP.TENDER_CLOSE.test(title)) {
    return handleCloseStep(prisma, {
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

  if (STEP.RFQ_PREPARE_EVAL.test(title) && isPositive) {
    const report = await latestEvaluationReport(prisma, projectId, procurementId);
    if (!report || !["SUBMITTED", "APPROVED"].includes(report.status)) {
      return {
        ok: false,
        error:
          "Submit the evaluation report first: Evaluation panel → fill the scores and recommendation → Submit report. Then complete this task.",
        status: 400,
      };
    }
    return complete({ evaluationReportId: report.id });
  }

  if (
    (STEP.RFQ_TECH_EVAL.test(title) ||
      STEP.RFQ_FIN_EVAL.test(title) ||
      STEP.RFQ_REVIEW_EVAL.test(title) ||
      STEP.RFQ_PREPARE_AWARD.test(title) ||
      STEP.RFQ_REVIEW_AWARD.test(title)) &&
    isPositive
  ) {
    // Progression checkpoints; the award itself still requires an approved evaluation report.
    return complete({ educationalCheckpoint: true });
  }

  if (STEP.TENDER_POST_QUAL.test(title) && isPositive) {
    const pq = await latestPostQualification(prisma, projectId, procurementId);
    if (!pq || !["SUBMITTED", "APPROVED"].includes(pq.status)) {
      return {
        ok: false,
        error:
          "Submit post-qualification first: Evaluation panel → Post-qualification → Run validation → Submit post-qualification. Then complete this task.",
        status: 400,
      };
    }
    return complete({ postQualificationReportId: pq.id });
  }

  if ((STEP.RFQ_APPROVE_EVAL.test(title) || STEP.TENDER_APPROVE_RECOMMENDATION.test(title)) && isPositive) {
    const report = body.evaluationReportId
      ? { id: String(body.evaluationReportId), status: "SUBMITTED" }
      : await latestEvaluationReport(prisma, projectId, procurementId);
    if (!report || !["SUBMITTED", "APPROVED"].includes(report.status)) {
      return {
        ok: false,
        error: "The Evaluation Committee has not submitted an evaluation report for this procurement yet.",
        status: 400,
      };
    }
    if (STEP.TENDER_APPROVE_RECOMMENDATION.test(title)) {
      const pq = await latestPostQualification(prisma, projectId, procurementId);
      if (!pq || !["SUBMITTED", "APPROVED"].includes(pq.status)) {
        return {
          ok: false,
          error: "The Evaluation Committee has not submitted post-qualification for the recommended bidder yet.",
          status: 400,
        };
      }
      if (pq.status === "SUBMITTED") {
        const pqDecided = await actOnProcurementLifecycle(prisma, {
          projectId,
          procurementId,
          action: "decide_post_qualification",
          actorOrgUserId: opts.actorOrgUserId,
          actorRoleName: opts.actorRoleName,
          actorDepartmentId: opts.actorDepartmentId,
          actingCommitteeType,
          body: { decision: "APPROVE", comment: opts.comment || "Approved by the Contracts Committee." },
        });
        if (!pqDecided.ok) return pqDecided;
      }
    }
    if (report.status === "APPROVED") return complete({ evaluationReportId: report.id });
    const { decideEvaluationReport } = await import("@/lib/projects/evaluation");
    const decided = await decideEvaluationReport(prisma, {
      projectId,
      evaluationReportId: report.id,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      decision: "APPROVE",
      comment: opts.comment || "Approved by the Contracts Committee.",
    });
    if (!decided.ok) return decided;
    return complete({ evaluationReportId: report.id });
  }

  if (STEP.RFQ_APPROVE_AWARD.test(title) && isPositive) {
    const created = await actOnProcurementLifecycle(prisma, {
      projectId,
      procurementId,
      action: "create_award",
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      actorDepartmentId: opts.actorDepartmentId,
      actingCommitteeType,
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
    const proc = await prisma.projectOrgProcurement.findFirst({
      where: { id: procurementId, projectId },
      select: { procurementMethod: true },
    });
    const action = proc?.procurementMethod === "TENDER" ? "create_contract" : "create_lpo";
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
    const { lpoId, contractId } = await orderDocumentIds(prisma, projectId, procurementId, body);
    if (lpoId) {
      const out = await actOnProcurementLifecycle(prisma, {
        projectId,
        procurementId,
        action: "approve_lpo",
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        body: { lpoId },
      });
      if (!out.ok) return out;
      return complete({ lpoId });
    }
    if (contractId) {
      const out = await actOnProcurementLifecycle(prisma, {
        projectId,
        procurementId,
        action: "approve_contract",
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        body: { contractId },
      });
      if (!out.ok) return out;
      return complete({ contractId });
    }
    return { ok: false, error: "No LPO or contract to approve yet.", status: 400 };
  }

  if ((STEP.RFQ_ISSUE_LPO.test(title) || /^issue contract$/i.test(title)) && isPositive) {
    const { lpoId, contractId } = await orderDocumentIds(prisma, projectId, procurementId, body);
    if (lpoId) {
      const out = await actOnProcurementLifecycle(prisma, {
        projectId,
        procurementId,
        action: "issue_lpo",
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        body: { lpoId },
      });
      if (!out.ok) return out;
      return complete({ lpoId });
    }
    if (contractId) {
      const signed = await actOnProcurementLifecycle(prisma, {
        projectId,
        procurementId,
        action: "sign_contract",
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        body: { contractId },
      });
      if (!signed.ok && !/signed|already/i.test(String(signed.error || ""))) return signed;
      const out = await actOnProcurementLifecycle(prisma, {
        projectId,
        procurementId,
        action: "issue_contract",
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        body: { contractId },
      });
      if (!out.ok) return out;
      return complete({ contractId });
    }
    return { ok: false, error: "No LPO or contract to issue yet.", status: 400 };
  }

  if ((STEP.RFQ_ACCEPT_SUPPLIER.test(title) || /^supplier acceptance$/i.test(title)) && isPositive) {
    const { lpoId, contractId } = await orderDocumentIds(prisma, projectId, procurementId, {});
    const doc = contractId
      ? await prisma.projectOrgContract.findUnique({ where: { id: contractId }, select: { status: true } })
      : lpoId
        ? await prisma.projectOrgLpo.findUnique({ where: { id: lpoId }, select: { status: true } })
        : null;
    const word = contractId ? "contract" : "LPO";
    if (!doc) return { ok: false, error: "No LPO or contract has been issued yet.", status: 400 };
    if (doc.status === "DECLINED") {
      return { ok: false, error: `The supplier declined the ${word}. Return or recommend instead.`, status: 409 };
    }
    if (doc.status !== (contractId ? "ACTIVE" : "ACCEPTED")) {
      return { ok: false, error: `Waiting for the supplier to accept the ${word} in the provider portal.`, status: 409 };
    }
    return complete(contractId ? { contractId } : { lpoId });
  }

  if ((STEP.RECORD_DELIVERY.test(title) || /^delivery$/i.test(title)) && isPositive) {
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      const recorded = (await listDeliveries(prisma, projectId, procurementId)).slice(-1)[0];
      if (recorded) return complete({ deliveryId: recorded.id });
      const dispatched = await prisma.projectOrgDeliveryNote.count({
        where: { projectId, procurementId, status: "SUBMITTED" },
      });
      return {
        ok: false,
        error: dispatched ? "Enter the received quantities." : "The provider has not delivered yet.",
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
    const latestDelivery = (await listDeliveries(prisma, projectId, procurementId)).slice(-1)[0];
    const deliveryId = typeof body.deliveryId === "string" ? body.deliveryId : latestDelivery?.id;
    if (!Array.isArray(body.lineDecisions) || body.lineDecisions.length === 0) {
      if (latestDelivery?.inspection) return complete({ deliveryId: latestDelivery.id });
      return {
        ok: false,
        error: latestDelivery ? "Mark each item accepted or rejected." : "No goods have been received yet.",
        status: 400,
      };
    }
    if (!deliveryId) {
      return { ok: false, error: "No delivery has been recorded yet for this procurement.", status: 400 };
    }
    const out = await actOnProcurementLifecycle(prisma, {
      projectId,
      procurementId,
      action: "record_inspection",
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      actorDepartmentId: opts.actorDepartmentId,
      actingCommitteeType,
      body: {
        deliveryId,
        resultNotes: body.resultNotes || opts.comment || null,
        lineDecisions: body.lineDecisions,
        committeeId: actingCommitteeType ? opts.committeeId : body.committeeId || null,
        committeeRole: actingCommitteeType ? opts.committeeRole || null : body.committeeRole || null,
      },
    });
    if (!out.ok) return out;
    return complete({ deliveryId });
  }

  if (STEP.RECEIVE_INVOICE.test(title) && isPositive) {
    const providerInvoiceId = typeof body.invoiceId === "string" ? body.invoiceId.trim() : "";
    const existingInvoice = await prisma.projectOrgInvoice.findFirst({
      where: {
        projectId,
        procurementId,
        status: { in: ["RECEIVED", "CERTIFIED", "VERIFIED"] },
        ...(providerInvoiceId ? { id: providerInvoiceId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });
    if (!existingInvoice && providerInvoiceId) {
      return {
        ok: false,
        error: "The selected provider invoice was not found or has already been processed.",
        status: 400,
      };
    }
    if (existingInvoice) {
      // Micro has no separate Verify Invoice step: processing certifies and verifies it so
      // Approve Payment can raise the payment.
      if (/^process invoice/i.test(title)) {
        const pending = { RECEIVED: ["certify_invoice", "verify_invoice"], CERTIFIED: ["verify_invoice"] };
        for (const action of pending[existingInvoice.status] || []) {
          const out = await actOnProcurementLifecycle(prisma, {
            projectId,
            procurementId,
            action,
            actorOrgUserId: opts.actorOrgUserId,
            actorRoleName: opts.actorRoleName,
            body: { invoiceId: existingInvoice.id },
          });
          if (!out.ok) return out;
        }
      }
      return complete({ invoiceId: existingInvoice.id, acknowledgedProviderInvoice: true });
    }
    return { ok: false, error: "The provider has not sent an invoice yet.", status: 400 };
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
    const existingPayments = await listPayments(prisma, projectId, procurementId);
    const openPayment = existingPayments.filter((p) => p.status !== "REJECTED").slice(-1)[0];
    if (!paymentId && openPayment && ["APPROVED", "PAID"].includes(openPayment.status)) {
      return complete({ paymentId: openPayment.id });
    }
    if (!paymentId && openPayment?.status === "PENDING") paymentId = openPayment.id;
    if (!paymentId && body.amount == null) {
      const verified = (await listInvoices(prisma, projectId, procurementId))
        .filter((i) => i.status === "VERIFIED")
        .slice(-1)[0];
      if (verified) {
        const created = await actOnProcurementLifecycle(prisma, {
          projectId,
          procurementId,
          action: "create_payment",
          actorOrgUserId: opts.actorOrgUserId,
          actorRoleName: opts.actorRoleName,
          body: { invoiceId: verified.id, amount: Number(verified.amount) },
        });
        if (!created.ok) return created;
        paymentId = created.payment?.id;
      }
    }
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
      return {
        ok: false,
        error: "The invoice must be processed (verified) before the payment can be approved.",
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
    const latestPayment = (await listPayments(prisma, projectId, procurementId))
      .filter((p) => p.status !== "REJECTED")
      .slice(-1)[0];
    if (typeof body.paymentId !== "string" && latestPayment?.status === "PAID") {
      return complete({ paymentId: latestPayment.id });
    }
    const paymentId = typeof body.paymentId === "string" ? body.paymentId : latestPayment?.id;
    if (!paymentId) {
      return { ok: false, error: "No approved payment is available to mark as paid.", status: 400 };
    }
    const out = await actOnProcurementLifecycle(prisma, {
      projectId,
      procurementId,
      action: "mark_payment_paid",
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      body: { paymentId, paymentDate: body.paymentDate || null, paymentReference: body.paymentReference || null },
    });
    if (!out.ok) return out;
    return complete({ paymentId });
  }

  if (STEP.CLOSE_PROCUREMENT.test(title) && isPositive) {
    const current = await prisma.projectOrgProcurement.findFirst({
      where: { id: procurementId, projectId },
      select: { status: true },
    });
    if (current?.status === OrgProcurementStatus.CLOSED) return complete({ closed: true });
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
  // Everything else (administrative steps with no dedicated business object)
  // just progresses the generic engine.
  // ---------------------------------------------------------------------
  return complete();
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
function latestEvaluationReport(prisma, projectId, procurementId) {
  return prisma.projectOrgEvaluationReport.findFirst({
    where: { projectId, procurementId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
function latestPostQualification(prisma, projectId, procurementId) {
  return prisma.projectOrgPostQualificationReport.findFirst({
    where: { projectId, procurementId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });
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
/**
 * Close/Lock Quotation Submission / Close Tender Submission: close now, reopen with a new
 * closing date, take offers while reopened, and forward only once submissions are closed.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {any} p same shape as {@link handleReceiveStep}
 */
async function handleCloseStep(prisma, p) {
  const { opts, body, projectId, procurementId, solicitationType, isPositive, complete } = p;
  const base = {
    projectId,
    procurementId,
    solicitationType,
    actorOrgUserId: opts.actorOrgUserId,
    actorRoleName: opts.actorRoleName,
  };

  if (body.generate || body.offer) {
    return handleReceiveStep(prisma, { ...p, body: { ...body, finalize: false }, isPositive: false });
  }
  if (body.lock === true) {
    const locked = await lockSolicitationSubmissions(prisma, base);
    if (!locked.ok) return locked;
    return { ok: true, solicitation: locked.solicitation, taskStatus: "PENDING" };
  }
  if (body.reopen && typeof body.reopen === "object") {
    const reopened = await reopenSolicitationSubmissions(prisma, { ...base, closingDate: body.reopen.closingDate });
    if (!reopened.ok) return reopened;
    return { ok: true, solicitation: reopened.solicitation, taskStatus: "PENDING" };
  }
  if (!isPositive) return complete();

  const solicitation = await findSolicitationForProcurement(prisma, base);
  if (!solicitation) {
    return { ok: false, error: "No issued solicitation was found for this procurement.", status: 400 };
  }
  if (!solicitation.closingDate || solicitation.closingDate.getTime() > Date.now()) {
    return { ok: false, error: "Close submissions first.", status: 400, code: "SUBMISSIONS_OPEN" };
  }
  const valid = await prisma.projectOrgOffer.count({
    where: { solicitationId: solicitation.id, status: { notIn: ["WITHDRAWN", "LATE"] } },
  });
  if (!valid) {
    const word = solicitationType === OrgSolicitationType.RFQ ? "quotation" : "bid";
    return { ok: false, error: `Record at least one valid ${word} first.`, status: 400 };
  }
  return complete({ solicitationId: solicitation.id });
}

async function handleReceiveStep(prisma, p) {
  const { opts, body, projectId, procurementId, solicitationType, isPositive, complete, resolveSupplierId } = p;

  if (body.generate && typeof body.generate === "object") {
    const generated = await generateQuotes(prisma, {
      projectId,
      procurementId,
      solicitationType,
      supplierId: typeof body.generate.supplierId === "string" ? body.generate.supplierId : "",
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!generated.ok) return generated;
    return { ...generated, taskStatus: "PENDING" };
  }

  if (body.clarification && typeof body.clarification === "object") {
    const asked = await askOfferClarification(prisma, {
      projectId,
      procurementId,
      offerId: body.clarification.offerId,
      question: body.clarification.question,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!asked.ok) return asked;
    return { ...asked, taskStatus: "PENDING" };
  }

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
      lineItems: body.offer.lineItems,
      deliveryDays: body.offer.deliveryDays,
      remarks: body.offer.remarks,
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

  const pool = await loadQuotePool(prisma, { projectId, procurementId });
  if (!pool) {
    return { ok: false, error: "This procurement has no solicitation to receive offers against.", status: 400 };
  }
  if (!pool.ready) {
    return { ok: false, error: pool.blockers[0], status: 400, code: "RECEIVE_NOT_READY" };
  }

  return complete();
}
