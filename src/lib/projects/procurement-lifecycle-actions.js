import {
  OrgProcurementStatus,
} from "@prisma/client";
import {
  createAwardFromApprovedEvaluation,
  communicateAward,
  cancelAward,
  getLatestAward,
} from "@/lib/projects/awards";
import {
  createLpo,
  approveLpo,
  issueLpo,
  createContract,
  approveContract,
  signContract,
  issueContract,
  updateOrderDeliveryAddress,
} from "@/lib/projects/contracts-lpo";
import { recordDelivery, recordInspection } from "@/lib/projects/deliveries";
import { createInvoice, certifyInvoice, verifyInvoice, rejectInvoice } from "@/lib/projects/invoices";
import { createPayment, approvePayment, markPaymentPaid, rejectPayment } from "@/lib/projects/payments";
import {
  closeProcurement,
  evaluateClosureReadiness,
} from "@/lib/projects/procurement-closure";
import { PROJECT_ORG_ENTRY_ROLE_NAME } from "@/lib/project-org-role";
import {
  decidePostQualification,
  getEvaluationContext,
  runPostQualification,
  saveEvaluationWithEligibility,
} from "@/lib/projects/evaluation-eligibility";
import {
  onBehalfAcceptAward,
  onBehalfAcceptOrder,
  onBehalfAcceptPurchaseInstruction,
  onBehalfAnswerClarification,
  onBehalfSubmitDeliveryNote,
  onBehalfSubmitInvoice,
} from "@/lib/projects/on-behalf-provider";

import {
  COMMITTEE_LIFECYCLE_AUTHORITY,
  LIFECYCLE_ACTION_ROLES,
  committeeMayPerformLifecycleAction,
} from "@/lib/projects/procurement-lifecycle-roles";
import { COMMITTEE_TYPE_WORKFLOW_ROLES } from "@/lib/projects/committee-context";
import { PHASE_PROCESS_BY_ACTION } from "@/lib/projects/process-catalogue";
import { assertProcessActive } from "@/lib/projects/process-activation";
import { okOrAbort, runInTx, withTxAbort } from "@/lib/db-tx";

export { LIFECYCLE_ACTION_ROLES };

/** Evaluation actions that belong to one workflow step and only run while it is pending. */
const EVALUATION_ACTION_STEPS = {
  save_evaluation: { re: /^prepare evaluation report/i, step: "Prepare Evaluation Report" },
  submit_evaluation: { re: /^prepare evaluation report/i, step: "Prepare Evaluation Report" },
  run_post_qualification: { re: /^post-qualification/i, step: "Post-Qualification" },
  decide_post_qualification: {
    re: /^approve evaluation\/recommendation/i,
    step: "Approve Evaluation/Recommendation",
  },
};

/**
 * @param {string} action
 * @param {string} roleName
 * @param {string | null} [actingCommitteeType] committee seat the actor is acting under
 */
export function canPerformLifecycleAction(action, roleName, actingCommitteeType = null) {
  const role = String(roleName || "").trim();
  const allowed = LIFECYCLE_ACTION_ROLES[action];
  if (allowed === undefined) {
    return { ok: false, error: `Unknown lifecycle action “${action}”.` };
  }
  // Read-only readiness check is available to any viewer (including Organization Administrator).
  if (allowed === null) return { ok: true };
  if (committeeMayPerformLifecycleAction(action, actingCommitteeType)) return { ok: true };
  if (allowed.length === 0) {
    const committees = Object.entries(COMMITTEE_LIFECYCLE_AUTHORITY)
      .filter(([, actions]) => actions.includes(action))
      .map(([type]) => COMMITTEE_TYPE_WORKFLOW_ROLES[type]?.[0] || type);
    return {
      ok: false,
      error: `“${action.replace(/_/g, " ")}” is a ${committees.join(" / ") || "committee"} decision under PPDA. Switch to that committee seat to act on it.`,
    };
  }
  if (!role || role === PROJECT_ORG_ENTRY_ROLE_NAME || role === "Admin") {
    return {
      ok: false,
      error:
        "The Organization Administrator configures the organisation but cannot perform operational procurement approvals or lifecycle actions.",
    };
  }
  if (!allowed.includes(role)) {
    return {
      ok: false,
      error: `Your organisational role (${role}) cannot perform “${action.replace(/_/g, " ")}”. Required role: ${allowed.join(" or ")}.`,
    };
  }
  return { ok: true };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   action: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   actorDepartmentId?: string | null;
 *   actingCommitteeType?: string | null;
 *   body?: any;
 * }} opts
 */
export async function actOnProcurementLifecycle(prisma, opts) {
  return withTxAbort(() =>
    runInTx(prisma, async (tx) => okOrAbort(await performLifecycleAction(tx, opts))),
  );
}

/**
 * One lifecycle action and its record updates (e.g. payment + procurement status), all or nothing.
 * @param {import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {any} opts
 */
async function performLifecycleAction(prisma, opts) {
  const action = String(opts.action || "").trim();
  const roleCheck = canPerformLifecycleAction(action, opts.actorRoleName, opts.actingCommitteeType || null);
  if (!roleCheck.ok) return { ...roleCheck, status: 403 };

  const procurement = await prisma.projectOrgProcurement.findFirst({
    where: { id: opts.procurementId, projectId: opts.projectId },
    select: {
      id: true,
      status: true,
      departmentId: true,
      procurementNumber: true,
      title: true,
    },
  });
  if (!procurement) {
    return { ok: false, error: "Procurement not found in this organisation.", status: 404 };
  }

  if (
    [OrgProcurementStatus.CLOSED, OrgProcurementStatus.CANCELLED, OrgProcurementStatus.REJECTED].includes(
      procurement.status,
    ) &&
    action !== "evaluate_closure" &&
    action !== "evaluation_context"
  ) {
    return {
      ok: false,
      error: `This procurement is ${procurement.status.toLowerCase()} and cannot be modified.`,
      status: 400,
      code: "PROCUREMENT_TERMINAL",
    };
  }

  // Department-scoped actors may only act on their own department's procurement.
  const deptScoped = ["User Department Officer", "Head User Department", "User Department", "Head of User Department"];
  if (
    deptScoped.includes(opts.actorRoleName) &&
    opts.actorDepartmentId &&
    procurement.departmentId &&
    opts.actorDepartmentId !== procurement.departmentId
  ) {
    return {
      ok: false,
      error:
        "You can only perform department-scoped actions on procurements belonging to your own department.",
      status: 403,
      code: "WRONG_DEPARTMENT",
    };
  }

  const body = opts.body && typeof opts.body === "object" ? opts.body : {};
  const base = {
    projectId: opts.projectId,
    actorOrgUserId: opts.actorOrgUserId,
    actorRoleName: opts.actorRoleName,
  };

  const phaseCode = PHASE_PROCESS_BY_ACTION[action];
  if (phaseCode) {
    const inactive = await assertProcessActive(prisma, opts.projectId, phaseCode);
    if (inactive) return inactive;
  }

  const stepGate = EVALUATION_ACTION_STEPS[action];
  if (stepGate) {
    const pending = await prisma.projectOrgWorkflowTask.findFirst({
      where: { projectId: opts.projectId, status: "PENDING", instance: { procurementId: opts.procurementId } },
      select: { title: true },
    });
    if (!stepGate.re.test(String(pending?.title || "").split(":")[0].trim())) {
      return { ok: false, error: `This is done at the ${stepGate.step} step.`, status: 400, code: "WRONG_STEP" };
    }
  }

  switch (action) {
    case "evaluate_closure":
      return evaluateClosureReadiness(prisma, opts.projectId, opts.procurementId);

    case "evaluation_context":
      return getEvaluationContext(prisma, {
        projectId: opts.projectId,
        procurementId: opts.procurementId,
        orgUserId: opts.actorOrgUserId,
        roleName: opts.actorRoleName,
        actingCommitteeType: opts.actingCommitteeType || null,
      });
    case "save_evaluation":
    case "submit_evaluation":
      return saveEvaluationWithEligibility(prisma, {
        ...base,
        procurementId: opts.procurementId,
        recommendedSupplierId: body.recommendedSupplierId,
        recommendation: body.recommendation,
        comments: body.comments,
        submit: action === "submit_evaluation",
      });
    case "run_post_qualification":
      return runPostQualification(prisma, {
        ...base,
        procurementId: opts.procurementId,
        comments: body.comments,
      });
    case "decide_post_qualification":
      return decidePostQualification(prisma, {
        ...base,
        procurementId: opts.procurementId,
        decision: body.decision,
        comment: body.comment,
      });

    case "create_award":
      return createAwardFromApprovedEvaluation(prisma, {
        ...base,
        procurementId: opts.procurementId,
        approvalReference:
          typeof body.approvalReference === "string" ? body.approvalReference : null,
      });

    case "communicate_award": {
      const awardId =
        typeof body.awardId === "string"
          ? body.awardId.trim()
          : (await getLatestAward(prisma, opts.projectId, opts.procurementId))?.id;
      if (!awardId) {
        return { ok: false, error: "No award exists for this procurement yet.", status: 400 };
      }
      return communicateAward(prisma, { ...base, awardId });
    }

    case "accept_award":
      return { ok: false, error: "The provider accepts the award from the provider portal.", status: 403 };

    case "on_behalf_accept_award":
      return onBehalfAcceptAward(prisma, { ...base, procurementId: opts.procurementId, body });
    case "on_behalf_accept_pi":
      return onBehalfAcceptPurchaseInstruction(prisma, {
        ...base,
        procurementId: opts.procurementId,
        body,
      });
    case "on_behalf_accept_order":
      return onBehalfAcceptOrder(prisma, { ...base, procurementId: opts.procurementId, body });
    case "on_behalf_submit_delivery_note":
      return onBehalfSubmitDeliveryNote(prisma, { ...base, procurementId: opts.procurementId, body });
    case "on_behalf_submit_invoice":
      return onBehalfSubmitInvoice(prisma, { ...base, procurementId: opts.procurementId, body });
    case "on_behalf_answer_clarification":
      return onBehalfAnswerClarification(prisma, { ...base, body });

    case "cancel_award": {
      const awardId =
        typeof body.awardId === "string"
          ? body.awardId.trim()
          : (await getLatestAward(prisma, opts.projectId, opts.procurementId))?.id;
      if (!awardId) {
        return { ok: false, error: "No award exists for this procurement yet.", status: 400 };
      }
      return cancelAward(prisma, {
        ...base,
        awardId,
        reason: typeof body.reason === "string" ? body.reason : "",
      });
    }

    case "update_delivery_address":
      return updateOrderDeliveryAddress(prisma, {
        ...base,
        procurementId: opts.procurementId,
        kind: body.kind === "contract" ? "contract" : "lpo",
        deliveryAddress: body.deliveryAddress,
      });

    case "create_lpo":
      return createLpo(prisma, {
        ...base,
        procurementId: opts.procurementId,
        deliveryAddress: typeof body.deliveryAddress === "string" ? body.deliveryAddress : null,
      });
    case "approve_lpo":
      if (!body.lpoId) return { ok: false, error: "lpoId is required.", status: 400 };
      return approveLpo(prisma, { ...base, lpoId: String(body.lpoId) });
    case "issue_lpo":
      if (!body.lpoId) return { ok: false, error: "lpoId is required.", status: 400 };
      return issueLpo(prisma, { ...base, lpoId: String(body.lpoId) });
    case "accept_lpo":
      return { ok: false, error: "The provider accepts the LPO from the provider portal.", status: 403 };

    case "create_contract":
      return createContract(prisma, {
        ...base,
        procurementId: opts.procurementId,
        startDate: body.startDate || null,
        endDate: body.endDate || null,
        deliveryAddress: typeof body.deliveryAddress === "string" ? body.deliveryAddress : null,
      });
    case "approve_contract":
      if (!body.contractId) return { ok: false, error: "contractId is required.", status: 400 };
      return approveContract(prisma, { ...base, contractId: String(body.contractId) });
    case "sign_contract":
      if (!body.contractId) return { ok: false, error: "contractId is required.", status: 400 };
      return signContract(prisma, { ...base, contractId: String(body.contractId) });
    case "issue_contract":
      if (!body.contractId) return { ok: false, error: "contractId is required.", status: 400 };
      return issueContract(prisma, { ...base, contractId: String(body.contractId) });

    case "record_delivery":
      return recordDelivery(prisma, {
        ...base,
        procurementId: opts.procurementId,
        deliveryDate: body.deliveryDate || null,
        remarks: typeof body.remarks === "string" ? body.remarks : null,
        deliveryNoteId: typeof body.deliveryNoteId === "string" ? body.deliveryNoteId : null,
        lines: Array.isArray(body.lines) ? body.lines : [],
      });

    case "record_inspection": {
      if (!body.deliveryId) {
        return { ok: false, error: "deliveryId is required for inspection.", status: 400 };
      }
      return recordInspection(prisma, {
        ...base,
        deliveryId: String(body.deliveryId),
        resultNotes: typeof body.resultNotes === "string" ? body.resultNotes : null,
        lineDecisions: Array.isArray(body.lineDecisions) ? body.lineDecisions : [],
        committeeId: body.committeeId || null,
        committeeRole: body.committeeRole || null,
      });
    }

    case "create_invoice":
      return createInvoice(prisma, {
        ...base,
        procurementId: opts.procurementId,
        amount: body.amount,
        invoiceDate: body.invoiceDate || null,
        deliveryId: body.deliveryId || null,
        supplierReference: typeof body.supplierReference === "string" ? body.supplierReference : null,
        notes: typeof body.notes === "string" ? body.notes : null,
        source: "OFFICER",
      });
    case "certify_invoice":
      if (!body.invoiceId) return { ok: false, error: "invoiceId is required.", status: 400 };
      return certifyInvoice(prisma, { ...base, invoiceId: String(body.invoiceId) });
    case "verify_invoice":
      if (!body.invoiceId) return { ok: false, error: "invoiceId is required.", status: 400 };
      return verifyInvoice(prisma, { ...base, invoiceId: String(body.invoiceId) });
    case "reject_invoice":
      if (!body.invoiceId) return { ok: false, error: "invoiceId is required.", status: 400 };
      return rejectInvoice(prisma, {
        ...base,
        invoiceId: String(body.invoiceId),
        reason: typeof body.reason === "string" ? body.reason : "",
      });

    case "create_payment":
      if (!body.invoiceId) return { ok: false, error: "invoiceId is required.", status: 400 };
      return createPayment(prisma, {
        ...base,
        procurementId: opts.procurementId,
        invoiceId: String(body.invoiceId),
        amount: body.amount,
        paymentReference: typeof body.paymentReference === "string" ? body.paymentReference : null,
      });
    case "approve_payment":
      if (!body.paymentId) return { ok: false, error: "paymentId is required.", status: 400 };
      return approvePayment(prisma, { ...base, paymentId: String(body.paymentId) });
    case "mark_payment_paid":
      if (!body.paymentId) return { ok: false, error: "paymentId is required.", status: 400 };
      return markPaymentPaid(prisma, {
        ...base,
        paymentId: String(body.paymentId),
        paymentDate: body.paymentDate || null,
        paymentReference: typeof body.paymentReference === "string" ? body.paymentReference : null,
      });
    case "reject_payment":
      if (!body.paymentId) return { ok: false, error: "paymentId is required.", status: 400 };
      return rejectPayment(prisma, {
        ...base,
        paymentId: String(body.paymentId),
        reason: typeof body.reason === "string" ? body.reason : "",
      });

    case "close_procurement":
      return closeProcurement(prisma, {
        ...base,
        procurementId: opts.procurementId,
        remarks: typeof body.remarks === "string" ? body.remarks : null,
      });

    default:
      return { ok: false, error: `Unknown lifecycle action “${action}”.`, status: 400 };
  }
}
