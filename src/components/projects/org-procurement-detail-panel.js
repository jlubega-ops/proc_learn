"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { useToast } from "@/components/providers/toast-provider";
import {
  actionConfirmOptions,
  decisionConfirmOptions,
  useConfirm,
} from "@/components/providers/confirm-provider";
import { WorkflowHistoryPanel } from "@/components/projects/workflow-history-panel";
import { useDraftSync } from "@/hooks/use-draft-sync";
import { notifyOrgTasksChanged } from "@/hooks/use-pending-task-counts";
import { OrgBidDocumentSection } from "@/components/projects/org-bid-document-section";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { formatMoneyAmount, formatMoneyUGX } from "@/lib/money";
import {
  defaultWorkflowDecision,
  isPositiveWorkflowDecision,
  workflowDecisionLabelForTask,
  workflowDecisionOptions,
  workflowStepActionLabel,
} from "@/lib/projects/workflow-decision-options";
import { workflowDecisionButtonLabel } from "@/lib/projects/workflow-status-presentation";
import { providerTerm } from "@/lib/projects/provider-terms";
import { OrgProviderSelection } from "@/components/projects/org-provider-selection";
import {
  OrgDeliveryAddressLine,
  OrgInvitedProvidersList,
  OrgOffersCard,
  SubmissionSourceChip,
} from "@/components/projects/org-procurement-supply-cards";
import { OrgEvaluationPanel } from "@/components/projects/org-evaluation-panel";
import {
  OrgAwardDecisionTrail,
  OrgAwardDetails,
  awardedOffer,
  OrgAwardOrderBasis,
  OrgAwardRecommendationSummary,
  OrgOrderSummary,
} from "@/components/projects/org-award-recommendation-summary";
import {
  OrgReopenSubmissionsDialog,
  OrgSubmissionWindow,
  submissionsOpen,
  submissionsReopenable,
} from "@/components/projects/org-submission-window";
import { OrgReceiveOffersPanel } from "@/components/projects/org-receive-offers-panel";
import Alert from "@mui/material/Alert";
import { ProcurementSectionGate } from "@/components/projects/org-procurement-stage-tracker";
import { RecordDetailsGrid } from "@/components/projects/record-details-grid";
import { OrgLineItemsTable } from "@/components/projects/org-line-items-table";
import { PrintButton, formatPrintDate } from "@/components/print/print-document";
import { ProcurementPrint } from "@/components/projects/org-procurement-print";
import {
  PurchaseInstructionPrint,
  PurchaseInstructionView,
} from "@/components/procurement/purchase-instruction-document";
import {
  OrgRecommendationDialog,
  OrgRecommendationsCard,
} from "@/components/projects/org-procurement-recommendation";
import {
  isRecommendationDecisionTask,
  recommendActionLabel,
} from "@/lib/projects/procurement-recommendation-options";
import GavelRounded from "@mui/icons-material/GavelRounded";
import {
  DEFAULT_PI_PAYMENT_TERMS,
  validatePurchaseInstructionTerms,
} from "@/lib/validation/purchase-instruction";
import { toDateInputValue } from "@/lib/financial-year-dates";
import { validateStartEndDateRange } from "@/lib/validation/date-range";
import { minRfqProviders } from "@/lib/projects/procurement-thresholds";
import { addDays, format } from "date-fns";
import {
  CERTIFY_DELIVERY_STEP_RE,
  OPEN_OFFERS_STEP_RE,
  VERIFY_INVOICE_STEP_RE,
  goodsReceivedEvidence,
  invoiceThreeWayMatch,
  latestStepSignOff,
  procurementMoneySummary,
} from "@/lib/projects/invoice-match";
import { ProcurementStageCards } from "@/components/projects/org-procurement-stage-cards";
import {
  isAcceptGoodsStep,
  isReceiveGoodsStep,
  procurementStageHref,
  procurementStageLabel,
  procurementTaskStage,
} from "@/lib/projects/procurement-task-stage";
import {
  LIFECYCLE_ACTION_ROLES,
  committeeMayPerformLifecycleAction,
} from "@/lib/projects/procurement-lifecycle-roles";
import AssignmentTurnedInRounded from "@mui/icons-material/AssignmentTurnedInRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import FactCheckRounded from "@mui/icons-material/FactCheckRounded";
import BlockRounded from "@mui/icons-material/BlockRounded";
import ReceiptLongRounded from "@mui/icons-material/ReceiptLongRounded";
import PaymentsRounded from "@mui/icons-material/PaymentsRounded";
import UndoRounded from "@mui/icons-material/UndoRounded";
import LockOpenRounded from "@mui/icons-material/LockOpenRounded";
import TaskAltRounded from "@mui/icons-material/TaskAltRounded";
import { useProcessActivation } from "@/hooks/use-process-activation";
import { ProcessGateTooltip } from "@/components/projects/process-gate";
import { PROCESS_FLOW_CODES, phaseProcessForTask } from "@/lib/projects/process-catalogue";
import {
  isBiddingMethod,
  isCompetitiveMethod,
  isMicroStyleMethod,
  methodUsesContract,
  methodUsesLpo,
  methodUsesOpenAdvert,
  procurementMethodLabel,
} from "@/lib/projects/procurement-methods";

const APPROVE_PAYMENT_STEP_RE = /^approve payment|^payment approval/i;
const RECORD_PAYMENT_STEP_RE = /^record payment|^payment recording/i;
const CLOSE_STEP_RE = /^close procurement|^procurement closure/i;
const INVOICE_STEP_RE =
  /^receive\/record invoice|^receive.?record invoice|^process invoice|^invoice$|^verify invoice|^invoice verification|^certify and verify invoice/i;

const SOLICITATION_STATUS_LABELS = {
  DRAFT: "Draft",
  REVIEW: "In review",
  APPROVED: "Approved",
  ISSUED: "Issued",
  ADVERTISED: "Advertised",
  OPEN: "Opened",
  CLOSED: "Closed",
};

/** @type {Record<string, "warning" | "info" | "success" | "error">} */
const SOLICITATION_STATUS_COLORS = {
  DRAFT: "warning",
  REVIEW: "warning",
  APPROVED: "success",
  ISSUED: "info",
  ADVERTISED: "info",
  OPEN: "info",
  CLOSED: "error",
};

/** Receive, Close and Open quotations / bids — one officer step on screen. */
const SUBMISSIONS_STEP_RE =
  /^receive (quotations|bids)|^close.?lock quotation|^close tender submission|^open (quotations|bids)/i;

/** @param {string | null | undefined} value */
function dateOrNull(value) {
  return value ? formatPrintDate(value) : null;
}

/**
 * @param {any} row
 * @param {string} projectId
 * @param {{ number: string; value: number; supplierName: string | null; deliveryAddress: string | null } | null} activeOrder
 */
function procurementDetailFields(row, projectId, activeOrder) {
  const req = row.requisition;
  const dept = row.department;
  const approvedProviders = (req?.shortlist || []).map((s) => s?.name).filter(Boolean).join(", ");
  const orderDoc = activeOrder
    ? activeOrder
    : row.contract && row.contract.status !== "CANCELLED"
      ? {
          number: row.contract.contractNumber,
          value: Number(row.contract.contractValue) || 0,
          supplierName: row.contract.supplier?.name || null,
          deliveryAddress: row.contract.deliveryAddress || null,
        }
      : row.lpo && row.lpo.status !== "CANCELLED"
        ? {
            number: row.lpo.lpoNumber,
            value: Number(row.lpo.lpoValue) || 0,
            supplierName: row.lpo.supplier?.name || null,
            deliveryAddress: row.lpo.deliveryAddress || null,
          }
        : null;
  const fields = [
    {
      label: "Requisition",
      value: req ? (
        <Link
          href={`/projects/${projectId}/requisitions/${req.id}`}
          className="cursor-pointer font-semibold text-primary underline"
        >
          {req.requisitionReference || req.title}
        </Link>
      ) : null,
      wide: true,
    },
    { label: "Financial year", value: row.financialYear?.label },
    { label: "Department", value: dept ? `${dept.name}${dept.code ? ` (${dept.code})` : ""}` : null },
    { label: "Current stage", value: row.stageLabel || row.statusLabel || row.status, wide: true },
    { label: "Category", value: req?.category },
    { label: "Method approved on", value: dateOrNull(row.methodSelectedAt) },
    {
      label: isMicroStyleMethod(row.procurementMethod) ? "Approved provider" : "Shortlisted providers",
      value:
        approvedProviders ||
        (methodUsesOpenAdvert(row.procurementMethod) ? "Open advertisement" : null),
      wide: true,
    },
    { label: "Plan item", value: row.procurementPlanItem?.title, wide: true },
    {
      label: "Budget line",
      value: row.budgetLine ? [row.budgetLine.code, row.budgetLine.name].filter(Boolean).join(" — ") : null,
      wide: true,
    },
    { label: "Estimated value", value: formatMoneyUGX(req?.estimatedTotalValue) },
    ...(orderDoc
      ? [
          { label: "Order / contract no.", value: orderDoc.number },
          { label: "Order value", value: formatMoneyUGX(orderDoc.value) },
          { label: "Provider on order", value: orderDoc.supplierName },
        ]
      : []),
    {
      label: "Delivery location",
      value: orderDoc?.deliveryAddress || req?.deliveryLocation,
      wide: true,
    },
    { label: "Procurement officer", value: row.officer?.displayName, wide: true },
    { label: "Created on", value: dateOrNull(row.createdAt) },
    ...(row.closedAt ? [{ label: "Closed on", value: dateOrNull(row.closedAt) }] : []),
  ];
  if (row.closedBy?.displayName) {
    fields.push({ label: "Closed by", value: row.closedBy.displayName, wide: true });
  }
  if (req?.needDescription) fields.push({ label: "Need", value: req.needDescription, full: true });
  if (row.closureRemarks) fields.push({ label: "Closure remarks", value: row.closureRemarks, full: true });
  return fields;
}

/**
 * `stage` null renders the read-only overview; a stage key renders that stage's actions only.
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   stage?: string | null;
 *   backHref?: string | null;
 *   backLabel?: string | null;
 * }} p
 */
export function OrgProcurementDetailPanel({ projectId, procurementId, stage = null, backHref = null, backLabel = null }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [row, setRow] = useState(/** @type {any} */ (null));
  const [piDoc, setPiDoc] = useState(/** @type {any} */ (null));
  const [printedBy, setPrintedBy] = useState(/** @type {any} */ (null));
  const [organisation, setOrganisation] = useState(/** @type {any} */ (null));
  const [stageSummaries, setStageSummaries] = useState(/** @type {any} */ (null));
  const [piProviderFailures, setPiProviderFailures] = useState(
    /** @type {{ id: string; name: string; reasons: string[] }[]} */ ([]),
  );
  const [piWarnOpen, setPiWarnOpen] = useState(false);
  const [pendingTask, setPendingTask] = useState(/** @type {any} */ (null));
  const [blockedTask, setBlockedTask] = useState(/** @type {any} */ (null));
  const [sections, setSections] = useState(/** @type {Record<string, any> | null} */ (null));
  const [viewerCommitteeType, setViewerCommitteeType] = useState(/** @type {string | null} */ (null));
  const [viewerRole, setViewerRole] = useState(/** @type {string | null} */ (null));
  const [flowStepLabel, setFlowStepLabel] = useState("");
  const [closure, setClosure] = useState(
    /** @type {{ ready?: boolean; blockers?: string[] } | null} */ (null),
  );
  const [decision, setDecision] = useState("APPROVE");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState("");
  const [approvalReference, setApprovalReference] = useState("");
  const [approvalReferenceError, setApprovalReferenceError] = useState("");
  /** null = untouched, so the default period is used. */
  const [contractStartInput, setContractStart] = useState(/** @type {string | null} */ (null));
  const [contractEndInput, setContractEnd] = useState(/** @type {string | null} */ (null));
  const [contractDateErrors, setContractDateErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const processes = useProcessActivation(projectId);
  const [suppliers, setSuppliers] = useState(/** @type {any[]} */ ([]));
  const [piSupplierIds, setPiSupplierIds] = useState(/** @type {string[]} */ ([]));
  const [inviteIds, setInviteIds] = useState(/** @type {string[]} */ ([]));
  const [selectionError, setSelectionError] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [quotePool, setQuotePool] = useState(/** @type {any} */ (null));
  const [clarifyAllowed, setClarifyAllowed] = useState(false);
  /** @type {[any, Function]} */
  const [invoiceToReject, setInvoiceToReject] = useState(null);
  const [invoiceRejectReason, setInvoiceRejectReason] = useState("");
  const [invoiceRejectError, setInvoiceRejectError] = useState("");
  /** null = untouched, so the generated reference is used. */
  const [paymentRefInput, setPaymentRef] = useState(/** @type {string | null} */ (null));
  const [paymentRefError, setPaymentRefError] = useState("");
  const [paymentReasonOpen, setPaymentReasonOpen] = useState(false);
  const [paymentReasonError, setPaymentReasonError] = useState("");
  const [closureRemarks, setClosureRemarks] = useState("");
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  /** @type {[Record<string, string>, Function]} */
  const [deliveryQtys, setDeliveryQtys] = useState({});
  const [receivedOn, setReceivedOn] = useState(() => toDateInputValue(new Date()));
  const [receiveRemarks, setReceiveRemarks] = useState("");
  const [certifyComment, setCertifyComment] = useState("");
  const [inspectionNotes, setInspectionNotes] = useState("");
  /** @type {[Record<string, { accepted: string; rejected: string }>, Function]} */
  const [inspectionLineEdits, setInspectionLineEdits] = useState({});
  /** @type {[Record<string, string>, Function]} */
  const [receiveErrors, setReceiveErrors] = useState({});
  /** @type {[Record<string, string>, Function]} */
  const [inspectionErrors, setInspectionErrors] = useState({});
  const [rejectReason, setRejectReason] = useState("");
  const [cancelAwardReason, setCancelAwardReason] = useState("");
  /** @type {import("react").RefObject<{ validate: () => boolean; save: () => Promise<boolean> } | null>} */
  const bidFormRef = useRef(null);
  const evalPanelRef = useRef(/** @type {{ prepare: () => Promise<boolean>; submit: () => Promise<boolean> } | null} */ (null));
  const [evalActionInside, setEvalActionInside] = useState(false);
  const [recommendation, setRecommendation] = useState(/** @type {any} */ (null));
  const [recommendations, setRecommendations] = useState(/** @type {any[]} */ ([]));
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [piTerms, setPiTerms] = useState({
    requiredDeliveryDate: "",
    paymentTerms: DEFAULT_PI_PAYMENT_TERMS,
    specialInstructions: "",
  });
  /** @type {[Record<string, string>, Function]} */
  const [piErrors, setPiErrors] = useState({});
  const taskDraft = useDraftSync(
    `org:procurement:${procurementId}:task:${pendingTask?.id || ""}`,
    {
      decision,
      comment,
      approvalReference,
      contractStartInput,
      contractEndInput,
      piSupplierIds,
      inviteIds,
      closingDate,
      paymentRefInput,
      closureRemarks,
      deliveryQtys,
      receivedOn,
      receiveRemarks,
      certifyComment,
      inspectionNotes,
      inspectionLineEdits,
      rejectReason,
      cancelAwardReason,
      piTerms,
    },
    (d) => {
      const str = (v) => typeof v === "string";
      const obj = (v) => v && typeof v === "object" && !Array.isArray(v);
      if (str(d.decision)) setDecision(d.decision);
      if (str(d.comment)) setComment(d.comment);
      if (str(d.approvalReference)) setApprovalReference(d.approvalReference);
      if (d.contractStartInput === null || str(d.contractStartInput)) setContractStart(d.contractStartInput);
      if (d.contractEndInput === null || str(d.contractEndInput)) setContractEnd(d.contractEndInput);
      if (Array.isArray(d.piSupplierIds)) setPiSupplierIds(d.piSupplierIds);
      if (Array.isArray(d.inviteIds)) setInviteIds(d.inviteIds);
      if (str(d.closingDate)) setClosingDate(d.closingDate);
      if (d.paymentRefInput === null || str(d.paymentRefInput)) setPaymentRef(d.paymentRefInput);
      if (str(d.closureRemarks)) setClosureRemarks(d.closureRemarks);
      if (obj(d.deliveryQtys)) setDeliveryQtys(d.deliveryQtys);
      if (str(d.receivedOn)) setReceivedOn(d.receivedOn);
      if (str(d.receiveRemarks)) setReceiveRemarks(d.receiveRemarks);
      if (str(d.certifyComment)) setCertifyComment(d.certifyComment);
      if (str(d.inspectionNotes)) setInspectionNotes(d.inspectionNotes);
      if (obj(d.inspectionLineEdits)) setInspectionLineEdits(d.inspectionLineEdits);
      if (str(d.rejectReason)) setRejectReason(d.rejectReason);
      if (str(d.cancelAwardReason)) setCancelAwardReason(d.cancelAwardReason);
      if (obj(d.piTerms)) setPiTerms((p) => ({ ...p, ...d.piTerms }));
    },
    { enabled: Boolean(pendingTask?.id) && !loading },
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/procurements/${procurementId}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not load procurement.",
          severity: "error",
        });
        setRow(null);
        setPendingTask(null);
        return;
      }
      setRow(data.procurement || null);
      setPiDoc(data.purchaseInstructionDoc || null);
      setPrintedBy(data.printedBy || null);
      setOrganisation(data.organisation || null);
      setStageSummaries(data.stageSummaries || null);
      setClosure(data.closure || null);
      setBlockedTask(data.blockedTask || null);
      setSections(data.viewer?.sections || null);
      setRecommendation(data.recommendation || null);
      setRecommendations(Array.isArray(data.recommendations) ? data.recommendations : []);
      setViewerCommitteeType(data.viewer?.committeeType || null);
      setViewerRole(data.viewer?.roleName || null);
      setFlowStepLabel(
        String(data.workflowProgress?.status || "").toUpperCase() === "COMPLETED"
          ? ""
          : String(data.workflowProgress?.currentStep?.label || ""),
      );
      const task = data.pendingTask || null;
      setPendingTask(task);
      const key = String(task?.actionKey || "").toUpperCase();
      setDecision(defaultWorkflowDecision(key));
      setComment("");
      setApprovalReference("");
      setApprovalReferenceError("");
      setContractStart(null);
      setContractEnd(null);
      setContractDateErrors({});
      const shortlistIds = (data.procurement?.requisition?.shortlist || [])
        .map((s) => s?.id)
        .filter(Boolean);
      setPiSupplierIds(shortlistIds.slice(0, 1));
      setInviteIds(shortlistIds);
      setSelectionError("");
      setClosingDate("");
      setQuotePool(data.quotePool || null);
      setClarifyAllowed(Boolean(data.offerClarification?.allowed));
      setDeliveryQtys({});
      setInspectionNotes("");
      setInspectionLineEdits({});
      setRejectReason("");
      setCancelAwardReason("");
    } finally {
      setLoading(false);
    }
  }, [projectId, procurementId, showToast]);

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/providers?status=ACTIVE&pageSize=100`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSuppliers(Array.isArray(data.providers) ? data.providers : []);
    } catch {
      // optional for roles without VIEW_PROVIDERS
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    void loadSuppliers();
  }, [load, loadSuppliers]);

  const actionKey = String(pendingTask?.actionKey || "").toUpperCase();
  const taskTitle = String(pendingTask?.title || "");
  const isIssuePi = /issue purchase instruction/i.test(taskTitle);
  const isRfqIssue = /issue rfqs to suppliers/i.test(taskTitle);
  const isTenderAdvertise = /advertise tender/i.test(taskTitle);
  const isReceive = Boolean(pendingTask) && SUBMISSIONS_STEP_RE.test(taskTitle);
  const taskStep = taskTitle.split(":")[0].trim();
  const isInvoiceTask = Boolean(pendingTask) && INVOICE_STEP_RE.test(taskStep);
  const isApprovePaymentTask = Boolean(pendingTask) && APPROVE_PAYMENT_STEP_RE.test(taskStep);
  const isRecordPaymentTask = Boolean(pendingTask) && RECORD_PAYMENT_STEP_RE.test(taskStep);
  const isCloseTask = Boolean(pendingTask) && CLOSE_STEP_RE.test(taskStep);
  const isPrepareDocsTask = Boolean(pendingTask) && /^prepare (rfq|tender) documents/i.test(taskStep);
  const isReviewDocsTask =
    Boolean(pendingTask) && /^(review|approve) (rfq|tender) documents/i.test(taskStep);
  const isApproveEvaluationTask =
    /^approve evaluation report|approve evaluation\/recommendation/i.test(taskTitle);
  /** @type {"technical" | "financial" | "report" | "postQualification" | "review" | "award" | null} */
  const evalStep = !pendingTask
    ? null
    : /^(prepare|review) award recommendation|^approve award$/i.test(taskStep)
      ? "award"
      : /^(review|approve) evaluation/i.test(taskStep)
        ? "review"
      : /^technical evaluation/i.test(taskStep)
      ? "technical"
      : /^financial evaluation/i.test(taskStep)
        ? "financial"
        : /^prepare evaluation report/i.test(taskStep)
          ? "report"
          : /^post-qualification/i.test(taskStep)
            ? "postQualification"
            : null;
  const isReceiveGoodsTask = Boolean(pendingTask) && isReceiveGoodsStep(taskTitle);
  const isAcceptGoodsTask = Boolean(pendingTask) && isAcceptGoodsStep(taskTitle);
  const isCertifyStep = /^certify delivery/i.test(taskStep);
  const isPositiveDecision = isPositiveWorkflowDecision(decision);
  const stepActionLabel = workflowStepActionLabel(taskTitle);
  const usesProviderPicker = (isIssuePi || isRfqIssue) && isPositiveDecision;
  const reqCategory = row?.requisition?.category || null;
  const approvedShortlistCount = (row?.requisition?.shortlist || []).length;
  const piApprovedProvider = usesProviderPicker && approvedShortlistCount > 0;
  const taskStage = recommendation?.canDecide
    ? "recommendation"
    : pendingTask
      ? procurementTaskStage(taskTitle)
      : null;
  const overview = !stage;
  /** @param {string} key */
  const on = (key) => stage === key;
  const isSectionStage = Boolean(stage) && stage !== "task" && stage !== "recommendation";
  const canViewStage = !isSectionStage || !sections || Boolean(sections[stage]?.view);
  const printPi = Boolean(piDoc) && on("contract") && isMicroStyleMethod(row?.procurementMethod) && canViewStage;
  /** null = whole record (viewable stages only); undefined = nothing to print. */
  const printStage = !isSectionStage ? null : canViewStage ? stage : undefined;
  const showTaskCard =
    !overview &&
    (stage === "task" || stage === taskStage) &&
    Boolean(pendingTask) &&
    !isRecommendationDecisionTask(taskTitle) &&
    !isReceiveGoodsTask &&
    !isAcceptGoodsTask &&
    !isInvoiceTask &&
    !isApprovePaymentTask &&
    !isRecordPaymentTask &&
    !isCloseTask &&
    !recommendation?.pending;
  const providerWord = providerTerm(reqCategory);
  const providerWordPlural = providerTerm(reqCategory, { plural: true });
  const evalInTaskCard =
    showTaskCard && Boolean(evalStep) && isCompetitiveMethod(row?.procurementMethod);
  const evalReportStep = evalInTaskCard && evalStep === "report" && isPositiveDecision;
  const isApproveAwardTask = evalStep === "award" && /^approve award$/i.test(taskStep);
  const isPrepareContractTask = Boolean(pendingTask) && /^prepare contract$/i.test(taskStep);
  const taskPhaseCode = pendingTask ? phaseProcessForTask(taskTitle, row?.procurementMethod) : null;
  const taskPhaseOff = Boolean(taskPhaseCode) && !processes.isActive(taskPhaseCode);
  const taskPhaseOffTitle = taskPhaseCode ? processes.inactiveTitle(taskPhaseCode) : "";
  const orderPhaseCode = methodUsesContract(row?.procurementMethod)
    ? PROCESS_FLOW_CODES.CONTRACT_PROCESS
    : methodUsesLpo(row?.procurementMethod)
      ? PROCESS_FLOW_CODES.LPO_PROCESS
      : null;
  const orderOff = Boolean(orderPhaseCode) && !processes.isActive(orderPhaseCode);
  const orderOffTitle = orderPhaseCode ? processes.inactiveTitle(orderPhaseCode) : "";
  const invoiceOff = !processes.isActive(PROCESS_FLOW_CODES.INVOICE_PROCESS);
  const invoiceOffTitle = processes.inactiveTitle(PROCESS_FLOW_CODES.INVOICE_PROCESS);
  const paymentOff = !processes.isActive(PROCESS_FLOW_CODES.PAYMENT_PROCESS);
  const paymentOffTitle = processes.inactiveTitle(PROCESS_FLOW_CODES.PAYMENT_PROCESS);
  const contractStart = contractStartInput ?? format(new Date(), "yyyy-MM-dd");
  const contractDeliveryDays = Number(row?.award ? awardedOffer(row).offer?.deliveryDays : 0) || 0;
  const contractEnd =
    contractEndInput ??
    (contractStart && contractDeliveryDays
      ? toDateInputValue(addDays(new Date(`${contractStart}T00:00:00Z`), contractDeliveryDays))
      : "");
  const stepActionInsidePanel = evalInTaskCard && evalActionInside && isPositiveDecision;

  /**
   * @param {string} label
   * @param {() => Promise<any>} run
   * @param {"primary" | "error" | "warning"} [color]
   */
  async function confirmThen(label, run, color = "primary") {
    if (!(await confirm(actionConfirmOptions(label, { color })))) return false;
    return run();
  }

  async function runLifecycle(action, body = {}, successMessage = "Lifecycle action recorded.") {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/procurements/${procurementId}/lifecycle`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...body }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const blockers = Array.isArray(data.blockers) ? data.blockers.join(" ") : "";
        showToast({
          message:
            typeof data.error === "string"
              ? data.error
              : blockers || "Could not complete lifecycle action.",
          severity: "error",
        });
        return false;
      }
      showToast({ message: successMessage, severity: "success" });
      taskDraft.clearDraft();
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Complete the pending delivery step with its payload (receipt lines or inspection decisions).
   * @param {Record<string, any>} extra
   * @param {string} successMessage
   */
  async function submitDeliveryTask(extra, successMessage) {
    if (!pendingTask?.id) return false;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: pendingTask.id,
          decision: defaultWorkflowDecision(actionKey),
          comment: "",
          ...extra,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save.",
          severity: "error",
        });
        return false;
      }
      showToast({ message: successMessage, severity: "success" });
      taskDraft.clearDraft();
      notifyOrgTasksChanged(projectId);
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function receiveGoods() {
    if (!pendingDeliveryNote) return;
    /** @type {Record<string, string>} */
    const errs = {};
    const lines = [];
    for (const l of pendingDeliveryNote.lines) {
      const raw = String(deliveryQtys[l.itemName] ?? l.quantity).trim();
      const n = Number(raw);
      if (!raw || !Number.isFinite(n) || n < 0) errs[l.itemName] = "Enter a quantity.";
      else if (n > Number(l.quantity) + 0.009) errs[l.itemName] = `Max ${l.quantity}.`;
      else if (n > 0) lines.push({ itemName: l.itemName, receivedQuantity: raw });
    }
    if (!Object.keys(errs).length && !lines.length) {
      for (const l of pendingDeliveryNote.lines) errs[l.itemName] = "Enter a quantity.";
    }
    const today = toDateInputValue(new Date());
    if (!receivedOn) errs.receivedOn = "Enter the date.";
    else if (receivedOn > today) errs.receivedOn = "Date cannot be in the future.";
    else if (receivedOn < toDateInputValue(pendingDeliveryNote.dispatchedAt)) {
      errs.receivedOn = "Cannot be before the dispatch date.";
    }
    if (receiveRemarks.trim().length > 2000) errs.receiveRemarks = "Max 2000 characters.";
    setReceiveErrors(errs);
    if (Object.keys(errs).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    const body = {
      lines,
      deliveryNoteId: pendingDeliveryNote.id,
      deliveryDate: receivedOn,
      remarks: receiveRemarks.trim() || null,
    };
    if (!(await confirm(actionConfirmOptions("Confirm receipt")))) return;
    const ok = isReceiveGoodsTask
      ? await submitDeliveryTask(body, "Goods received.")
      : await runLifecycle("record_delivery", body, "Goods received.");
    if (ok) {
      setDeliveryQtys({});
      setReceiveRemarks("");
    }
  }

  /** @param {any} d */
  async function inspectDelivery(d) {
    /** @type {Record<string, string>} */
    const errs = {};
    const lineDecisions = (d.lines || []).map((l) => {
      const edit = inspectionLineEdits[l.id];
      const acceptedRaw = String(edit?.accepted ?? l.receivedQuantity).trim();
      const rejectedRaw = String(edit?.rejected ?? "0").trim() || "0";
      const accepted = Number(acceptedRaw);
      const rejected = Number(rejectedRaw);
      if (!acceptedRaw || !Number.isFinite(accepted) || accepted < 0) errs[`${l.id}:accepted`] = "Enter a quantity.";
      if (!Number.isFinite(rejected) || rejected < 0) errs[`${l.id}:rejected`] = "Enter a quantity.";
      else if (Number.isFinite(accepted) && Math.abs(accepted + rejected - Number(l.receivedQuantity)) > 0.009) {
        errs[`${l.id}:accepted`] = `Must total ${formatMoneyAmount(l.receivedQuantity)}.`;
      }
      return { lineId: l.id, acceptedQuantity: acceptedRaw, rejectedQuantity: rejectedRaw };
    });
    if (lineDecisions.some((ld) => Number(ld.rejectedQuantity) > 0) && !inspectionNotes.trim()) {
      errs.inspectionNotes = "Enter the reason for rejection.";
    }
    setInspectionErrors(errs);
    if (Object.keys(errs).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    const fullyAccepted = lineDecisions.every(
      (ld, i) => Number(ld.acceptedQuantity) + 0.009 >= Number(d.lines[i].receivedQuantity),
    );
    const body = {
      deliveryId: d.id,
      resultNotes: inspectionNotes.trim() || (fullyAccepted ? "Accepted in full." : "Inspection recorded."),
      lineDecisions,
    };
    if (!(await confirm(actionConfirmOptions("Confirm inspection")))) return;
    const ok = isAcceptGoodsTask
      ? await submitDeliveryTask(body, "Inspection confirmed.")
      : await runLifecycle("record_inspection", body, "Inspection confirmed.");
    if (ok) {
      setInspectionErrors({});
      setInspectionLineEdits({});
      setInspectionNotes("");
    }
  }

  /** @param {{ acknowledged?: boolean }} [opts] */
  async function submitDecision(opts = {}) {
    if (!pendingTask?.id) return;
    if (decision === "REOPEN") {
      setReopenOpen(true);
      return;
    }
    if ((decision === "RETURN" || decision === "REJECT") && !comment.trim()) {
      setCommentError("Enter the reason.");
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setCommentError("");
    if (isIssuePi && isPositiveDecision && piProviderFailures.length && !opts.acknowledged) {
      setPiWarnOpen(true);
      return;
    }
    if (isIssuePi && isPositiveDecision) {
      const check = validatePurchaseInstructionTerms(piTerms);
      setPiErrors(check.errors);
      if (!check.ok) {
        showToast({ message: "Please fix the highlighted fields.", severity: "error" });
        return;
      }
    }
    if (usesProviderPicker) {
      const missing = isIssuePi ? !piSupplierIds[0] : inviteIds.length === 0;
      if (missing) {
        setSelectionError(
          isIssuePi
            ? `Select a ${providerWord}.`
            : `Select at least one ${providerWord} to invite.`,
        );
        showToast({
          message: "Please fix the highlighted fields.",
          severity: "error",
        });
        return;
      }
    }
    setSelectionError("");
    if (isApproveAwardTask && isPositiveDecision && approvalReference.trim().length > 128) {
      setApprovalReferenceError("Keep it under 128 characters.");
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setApprovalReferenceError("");
    if (isPrepareContractTask && isPositiveDecision) {
      const range = validateStartEndDateRange(contractStart, contractEnd);
      setContractDateErrors(range.errors);
      if (!range.ok) {
        showToast({ message: "Please fix the highlighted fields.", severity: "error" });
        return;
      }
    }
    if (isPrepareDocsTask && !bidFormRef.current?.validate()) return;
    if (evalReportStep && !(await evalPanelRef.current?.prepare())) return;
    if (
      !opts.acknowledged &&
      !(await confirm(
        decisionConfirmOptions(decision, "this procurement", {
          actionLabel: isPrepareDocsTask
            ? `Submit the ${isBiddingMethod(row?.procurementMethod) ? "tender" : "RFQ"} document for review`
            : isPositiveDecision
              ? stepActionLabel
              : "",
        }),
      ))
    ) {
      return;
    }
    setBusy(true);
    try {
      if (isPrepareDocsTask && !(await bidFormRef.current?.save())) return;
      if (evalReportStep && !(await evalPanelRef.current?.submit())) return;
      /** @type {Record<string, any>} */
      const payload = {
        taskId: pendingTask.id,
        decision,
        comment,
      };
      if (isIssuePi && piSupplierIds[0]) payload.supplierId = piSupplierIds[0];
      if (isIssuePi && isPositiveDecision) Object.assign(payload, piTerms);
      if (isRfqIssue) payload.inviteSupplierIds = inviteIds;
      if ((isRfqIssue || isTenderAdvertise) && closingDate) payload.closingDate = closingDate;
      if (isPrepareContractTask && isPositiveDecision) {
        payload.startDate = contractStart;
        payload.endDate = contractEnd;
      }
      if (isApproveAwardTask && isPositiveDecision && approvalReference.trim()) {
        payload.approvalReference = approvalReference.trim();
      }
      const latestReport = Array.isArray(row?.evaluationReports) ? row.evaluationReports[0] : null;
      if (
        isApproveEvaluationTask &&
        decision === "APPROVE" &&
        latestReport?.status === "SUBMITTED"
      ) {
        payload.evaluationReportId = latestReport.id;
      }
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fe = data.fieldErrors || {};
        setSelectionError(fe.supplierId || fe.inviteSupplierIds || "");
        if (isIssuePi) setPiErrors(fe);
        if (isPrepareContractTask && (fe.startDate || fe.endDate)) setContractDateErrors(fe);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not record decision.",
          severity: "error",
        });
        return;
      }
      const message = isPrepareDocsTask
        ? `${isBiddingMethod(row?.procurementMethod) ? "Tender" : "RFQ"} document submitted for review.`
        : evalReportStep
          ? "Evaluation report submitted."
        : isIssuePi && isPositiveDecision
          ? "Purchase instruction issued."
          : isRfqIssue && isPositiveDecision
            ? "Requests for quotations issued."
            : isTenderAdvertise && isPositiveDecision
              ? "Tender advertised."
              : isReceive && isPositiveDecision
                ? `${isBiddingMethod(row?.procurementMethod) ? "Bids" : "Quotations"} opened and submitted.`
                : "Decision recorded.";
      showToast({ message, severity: "success" });
      taskDraft.clearDraft();
      notifyOrgTasksChanged(projectId);
      await load();
      await loadSuppliers();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy>
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  if (!row) {
    return <Typography sx={adminMutedTextSx}>Procurement not found.</Typography>;
  }

  const pi = row.purchaseInstruction || row.purchaseInstructions?.[0] || null;
  const solicitations = Array.isArray(row.solicitations) ? row.solicitations : [];
  const offers = Array.isArray(row.offers) ? row.offers : [];
  const latestSolicitation = solicitations[0] || null;
  const sourcingOnOverview =
    (overview || on("evaluation")) &&
    Boolean(latestSolicitation) &&
    !["DRAFT", "REVIEW", "APPROVED"].includes(latestSolicitation.status) &&
    (!sections || Boolean(sections.sourcing?.view));
  const isPrepareOrderTask = Boolean(pendingTask) && /^prepare (lpo|contract)/i.test(taskStep);
  const isForwardBidsTask = Boolean(pendingTask) && /^forward bids for evaluation/i.test(taskStep);
  const openedSignOff = latestSolicitation?.openedAt ? latestStepSignOff(row.timeline, OPEN_OFFERS_STEP_RE) : null;
  const awaitingAwardAcceptance =
    isPrepareOrderTask && Boolean(row.award) && row.award.status !== "ACCEPTED";
  const isConfirmOrderAcceptanceTask =
    Boolean(pendingTask) && /^(confirm supplier acceptance|supplier acceptance)/i.test(taskStep);
  const orderDocForTask = row.contract || row.lpo || null;
  const orderAcceptanceBlocker = !isConfirmOrderAcceptanceTask
    ? ""
    : !orderDocForTask
      ? "No LPO or contract issued yet."
      : orderDocForTask.status === "DECLINED"
        ? `The supplier declined the ${row.contract ? "contract" : "LPO"}.`
        : ["ACCEPTED", "ACTIVE"].includes(orderDocForTask.status)
          ? ""
          : `Waiting for the supplier to accept the ${row.contract ? "contract" : "LPO"}.`;
  const bidding = isBiddingMethod(row.procurementMethod);
  const offerWord = bidding ? "bids" : "quotations";
  const receivingOpen = isReceive && !latestSolicitation?.openedAt && submissionsOpen(latestSolicitation);
  const receiveBlocker = !isPositiveDecision
    ? ""
    : isReceive
      ? receivingOpen
        ? `Close ${offerWord} first.`
        : latestSolicitation?.openedAt
          ? ""
          : quotePool
            ? quotePool.ready
              ? ""
              : quotePool.blockers?.[0] || "Requirements not met."
            : offers.some((o) => o.status !== "WITHDRAWN" && o.status !== "LATE")
              ? ""
              : `No ${providerWord.toLowerCase()} response yet`
      : awaitingAwardAcceptance
        ? "Waiting for the supplier to accept the award."
        : orderAcceptanceBlocker;
  const usesBidDocument = isCompetitiveMethod(row.procurementMethod);
  const bidDocWord = bidding ? "Tender document" : "RFQ document";
  const docInTaskCard =
    showTaskCard && (isPrepareDocsTask || isReviewDocsTask || ((isTenderAdvertise || isRfqIssue) && usesBidDocument));
  const baseDecisionOptions = workflowDecisionOptions(actionKey, { isProcurementStep: true })
    .filter((opt) => opt.value !== "RETURN" || Boolean(recommendation?.returnAllowed))
    .filter((opt) => opt.value !== "REJECT" || recommendation?.returnRejectAllowed !== false);
  const taskDecisionOptions =
    isReceive && submissionsReopenable(latestSolicitation)
      ? [baseDecisionOptions[0], { value: "REOPEN", label: `Reopen ${offerWord}` }, ...baseDecisionOptions.slice(1)].filter(
          Boolean,
        )
      : baseDecisionOptions;
  const inDocumentsPhase =
    /^(prepare|review|approve) (rfq|tender) documents/i.test(String(row.currentStepLabel || "")) &&
    (!latestSolicitation || ["DRAFT", "REVIEW"].includes(latestSolicitation.status));
  /** @type {{ label: string; color: "warning" | "info" | "success" | "error" } | null} */
  const solicitationChip =
    inDocumentsPhase && row.stageLabel
      ? { label: row.stageLabel, color: "warning" }
      : latestSolicitation?.openedAt
        ? { label: `Opened ${formatPrintDate(latestSolicitation.openedAt)}`, color: "success" }
        : latestSolicitation
          ? {
              label: SOLICITATION_STATUS_LABELS[latestSolicitation.status] || latestSolicitation.status,
              color: SOLICITATION_STATUS_COLORS[latestSolicitation.status] || "info",
            }
          : null;
  /** @param {boolean} editable */
  const bidDocumentSection = (editable) => (
    <OrgBidDocumentSection
      ref={editable ? bidFormRef : undefined}
      projectId={projectId}
      procurement={row}
      organisation={organisation}
      issuer={printedBy}
      editable={editable}
    />
  );
  const requisitionAddress = row.requisition?.deliveryLocation || null;

  /** @type {{ number: string; value: number; supplierName: string | null; deliveryAddress: string | null } | null} */
  let activeOrder = null;
  if (row.contract && ["ACTIVE", "ISSUED", "SIGNED"].includes(row.contract.status)) {
    activeOrder = {
      kind: "Contract",
      number: row.contract.contractNumber,
      value: Number(row.contract.contractValue) || 0,
      supplierName: row.contract.supplier?.name || null,
      deliveryAddress: row.contract.deliveryAddress || requisitionAddress,
    };
  } else if (row.lpo && ["ACCEPTED", "ISSUED"].includes(row.lpo.status)) {
    activeOrder = {
      kind: "LPO",
      number: row.lpo.lpoNumber,
      value: Number(row.lpo.lpoValue) || 0,
      supplierName: row.lpo.supplier?.name || null,
      deliveryAddress: row.lpo.deliveryAddress || requisitionAddress,
    };
  } else if (pi && ["ISSUED", "ACCEPTED"].includes(pi.status)) {
    activeOrder = {
      kind: "PI",
      number: pi.instructionNumber,
      value: Number(pi.amount) || 0,
      supplierName: pi.supplier?.name || null,
      deliveryAddress: pi.deliveryAddress || requisitionAddress,
    };
  }
  const pendingDeliveryNote = (row.deliveryNotes || []).find((n) => n.status === "SUBMITTED") || null;
  const deliveries = Array.isArray(row.deliveries) ? row.deliveries : [];
  const orderProvider = activeOrder?.supplierName || `the ${providerWord}`;
  const orderNotOpen = row.contract
    ? row.contract.status === "ACTIVE"
      ? null
      : row.contract.status === "ISSUED"
        ? `Waiting for ${orderProvider} to accept ${row.contract.contractNumber}.`
        : "The contract has not been issued yet."
    : row.lpo
      ? row.lpo.status === "ACCEPTED"
        ? null
        : `Waiting for ${orderProvider} to accept ${row.lpo.lpoNumber}.`
      : pi
        ? pi.status === "ACCEPTED"
          ? null
          : `Waiting for ${orderProvider} to accept ${pi.instructionNumber}.`
        : "No order yet.";
  /** @type {Record<string, number>} */
  const receivedByItem = {};
  for (const d of deliveries) {
    for (const l of d.lines || []) {
      receivedByItem[l.itemName] = (receivedByItem[l.itemName] || 0) + (Number(l.receivedQuantity) || 0);
    }
  }
  const reqItems = row.requisition?.items || [];
  const allReceived =
    reqItems.length > 0 &&
    reqItems.every((it) => (receivedByItem[it.itemName] || 0) + 0.009 >= Number(it.quantity || 0));
  const allInspected = deliveries.length > 0 && deliveries.every((d) => d.inspection);
  /** @param {string} itemName */
  const orderedQtyLabel = (itemName) => {
    const it = reqItems.find((i) => i.itemName === itemName);
    return it ? `${it.quantity}${it.unitOfMeasure ? ` ${it.unitOfMeasure}` : ""}` : "—";
  };
  const deliveryStepOpen = isReceiveGoodsStep(flowStepLabel) || isAcceptGoodsStep(flowStepLabel);
  const deliveryAct = Boolean(sections?.delivery?.act) && !deliveryStepOpen;
  const canReceiveGoods =
    isReceiveGoodsTask || (deliveryAct && LIFECYCLE_ACTION_ROLES.record_delivery.includes(viewerRole || ""));
  const canInspectGoods =
    isAcceptGoodsTask ||
    (deliveryAct &&
      (LIFECYCLE_ACTION_ROLES.record_inspection.includes(viewerRole || "") ||
        committeeMayPerformLifecycleAction("record_inspection", viewerCommitteeType)));
  const invoices = Array.isArray(row.invoices) ? row.invoices : [];
  const invoicesNewestFirst = [...invoices].sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
  );
  const openInvoice =
    invoicesNewestFirst.find((i) => ["RECEIVED", "CERTIFIED"].includes(i.status)) ||
    (isInvoiceTask ? invoicesNewestFirst.find((i) => i.status === "VERIFIED") : null) ||
    null;
  const latestInvoice = invoicesNewestFirst[0] || null;
  const invoiceAct = Boolean(sections?.invoice?.act) && !INVOICE_STEP_RE.test(flowStepLabel);
  const invoiceTaskVerb = /^process invoice/i.test(taskStep)
    ? ["Process invoice", "Invoice processed."]
    : /verif/i.test(taskStep)
      ? ["Verify invoice", "Invoice verified."]
      : ["Confirm invoice received", "Invoice received."];
  /** @type {{ label: string; run: () => Promise<boolean> } | null} */
  const invoiceAction = !openInvoice
    ? null
    : isInvoiceTask
      ? {
          label: invoiceTaskVerb[0],
          run: () => submitDeliveryTask({ invoiceId: openInvoice.id }, invoiceTaskVerb[1]),
        }
      : invoiceAct &&
          openInvoice.status === "RECEIVED" &&
          LIFECYCLE_ACTION_ROLES.certify_invoice.includes(viewerRole || "")
        ? {
            label: "Certify invoice",
            run: () => runLifecycle("certify_invoice", { invoiceId: openInvoice.id }, "Invoice certified."),
          }
        : invoiceAct &&
            openInvoice.status === "CERTIFIED" &&
            LIFECYCLE_ACTION_ROLES.verify_invoice.includes(viewerRole || "")
          ? {
              label: "Verify invoice",
              run: () => runLifecycle("verify_invoice", { invoiceId: openInvoice.id }, "Invoice verified."),
            }
          : null;
  const canRejectInvoice =
    Boolean(openInvoice) &&
    ["RECEIVED", "CERTIFIED"].includes(openInvoice?.status) &&
    (isInvoiceTask || invoiceAct) &&
    LIFECYCLE_ACTION_ROLES.reject_invoice.includes(viewerRole || "");
  const processedInvoices = invoicesNewestFirst.filter((i) => i.id !== openInvoice?.id);
  const orderPricedLines = row.orderLines?.length ? row.orderLines : awardedOffer(row).lines;
  const orderValueNum = activeOrder ? Number(activeOrder.value) : null;
  const invoiceMatch = openInvoice
    ? invoiceThreeWayMatch({ row, invoice: openInvoice, orderValue: orderValueNum, pricedLines: orderPricedLines })
    : null;
  const goodsEvidence = openInvoice ? goodsReceivedEvidence(row) : null;

  async function confirmRejectInvoice() {
    const reason = invoiceRejectReason.trim();
    if (!reason) {
      setInvoiceRejectError("Enter a reason.");
      return;
    }
    const ok = await runLifecycle(
      "reject_invoice",
      { invoiceId: invoiceToReject?.id, reason },
      "Invoice rejected.",
    );
    if (ok) {
      setInvoiceToReject(null);
      setInvoiceRejectReason("");
    }
  }

  const paymentsNewestFirst = [...(row.payments || [])].sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
  );
  const currentPayment = paymentsNewestFirst.find((p) => p.status !== "REJECTED") || null;
  const payableInvoice =
    invoices.find((i) => i.id === currentPayment?.invoiceId) ||
    invoicesNewestFirst.find((i) => ["VERIFIED", "APPROVED_FOR_PAYMENT"].includes(i.status)) ||
    null;
  const paymentMatch = payableInvoice
    ? invoiceThreeWayMatch({ row, invoice: payableInvoice, orderValue: orderValueNum, pricedLines: orderPricedLines })
    : null;
  const invoiceVerified = payableInvoice ? latestStepSignOff(row.timeline, VERIFY_INVOICE_STEP_RE) : null;
  const thisPaymentAmount = Number(currentPayment?.amount ?? payableInvoice?.amount) || 0;
  const previouslyPaid = paymentsNewestFirst
    .filter((p) => p.status === "PAID" && p.id !== currentPayment?.id)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const generatedPaymentRef = `PAY-${row.procurementNumber || "PROC"}-${String(
    paymentsNewestFirst.filter((p) => p.paymentReference).length + 1,
  ).padStart(3, "0")}`;
  const paymentRef = paymentRefInput ?? generatedPaymentRef;
  const paymentAct =
    Boolean(sections?.payment?.act) &&
    !APPROVE_PAYMENT_STEP_RE.test(flowStepLabel) &&
    !RECORD_PAYMENT_STEP_RE.test(flowStepLabel);
  /** @param {keyof typeof LIFECYCLE_ACTION_ROLES} action */
  const awardMay = (action) =>
    viewerCommitteeType
      ? committeeMayPerformLifecycleAction(action, viewerCommitteeType)
      : (LIFECYCLE_ACTION_ROLES[action] || []).includes(viewerRole || "");
  const awardInTaskCard =
    showTaskCard && Boolean(row?.award) && (procurementTaskStage(taskTitle) === "award" || isPrepareOrderTask);
  const orderInTaskCard =
    showTaskCard &&
    !isPrepareOrderTask &&
    Boolean(row?.lpo || row?.contract) &&
    procurementTaskStage(taskTitle) === "contract";
  const awardCancellable =
    Boolean(row?.award) &&
    awardMay("cancel_award") &&
    !row?.lpo &&
    !row?.contract &&
    ["APPROVED", "COMMUNICATED", "ACCEPTED"].includes(row?.award?.status);
  const contractInWorkflow =
    procurementTaskStage(String(row?.currentStepLabel || "")) === "contract" ||
    (row?.timeline || []).some(
      (a) => a.source === "workflow" && a.taskTitle && procurementTaskStage(a.taskTitle) === "contract",
    );
  const awardInWorkflow =
    evalStep === "award" ||
    (row?.timeline || []).some(
      (a) => a.source === "workflow" && a.taskTitle && procurementTaskStage(a.taskTitle) === "award",
    );
  /** @param {keyof typeof LIFECYCLE_ACTION_ROLES} action */
  const paymentRoleMay = (action) => paymentAct && LIFECYCLE_ACTION_ROLES[action].includes(viewerRole || "");
  /** @type {{ kind: "raise" | "approve" | "record"; label: string; run: () => Promise<boolean> } | null} */
  const paymentAction =
    isApprovePaymentTask && (currentPayment?.status === "PENDING" || (!currentPayment && payableInvoice))
      ? { kind: "approve", label: "Approve payment", run: () => submitDeliveryTask({}, "Payment approved.") }
      : isRecordPaymentTask && currentPayment?.status === "APPROVED"
        ? {
            kind: "record",
            label: "Record payment",
            run: () =>
              submitDeliveryTask({ paymentReference: paymentRef.trim(), paymentId: currentPayment.id }, "Payment recorded."),
          }
        : !currentPayment && payableInvoice && paymentRoleMay("create_payment")
          ? {
              kind: "raise",
              label: "Raise payment",
              run: () =>
                runLifecycle(
                  "create_payment",
                  { invoiceId: payableInvoice.id, amount: payableInvoice.amount },
                  "Payment raised.",
                ),
            }
          : currentPayment?.status === "PENDING" && paymentRoleMay("approve_payment")
            ? {
                kind: "approve",
                label: "Approve payment",
                run: () => runLifecycle("approve_payment", { paymentId: currentPayment.id }, "Payment approved."),
              }
            : currentPayment?.status === "APPROVED" && paymentRoleMay("mark_payment_paid")
              ? {
                  kind: "record",
                  label: "Record payment",
                  run: () =>
                    runLifecycle(
                      "mark_payment_paid",
                      { paymentId: currentPayment.id, paymentReference: paymentRef.trim() },
                      "Payment recorded.",
                    ),
                }
              : null;
  /** "return" sends the approval step back; "reject" rejects a pending payment outside the workflow. */
  const paymentSecondary = isApprovePaymentTask
    ? "return"
    : currentPayment?.status === "PENDING" && paymentRoleMay("reject_payment")
      ? "reject"
      : null;

  async function runPaymentAction() {
    if (!paymentAction) return;
    if (paymentAction.kind === "record" && !paymentRef.trim()) {
      setPaymentRefError("Enter the payment reference.");
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    const message =
      paymentAction.kind === "record" ? `Reference ${paymentRef.trim()}. This cannot be undone.` : undefined;
    if (!(await confirm(actionConfirmOptions(paymentAction.label, { message })))) return;
    const ok = await paymentAction.run();
    if (ok) setPaymentRef(null);
  }

  const closureBlockers = closure && !closure.ready ? closure.blockers || [] : [];
  const canClose =
    isCloseTask ||
    (Boolean(sections?.closure?.act) &&
      !CLOSE_STEP_RE.test(flowStepLabel) &&
      LIFECYCLE_ACTION_ROLES.close_procurement.includes(viewerRole || ""));

  const orderStatus = row.contract?.status || row.lpo?.status || pi?.status || null;
  const orderDone = Boolean(activeOrder) && !orderNotOpen;
  const verifiedInvoices = invoices.filter((i) => ["VERIFIED", "APPROVED_FOR_PAYMENT"].includes(i.status));
  const paidPayments = paymentsNewestFirst.filter((p) => p.status === "PAID");
  const moneySummary = procurementMoneySummary({ row, orderValue: orderValueNum, pricedLines: orderPricedLines });
  const invoicedTotal = moneySummary.invoiced;
  const paidTotal = moneySummary.paid;
  const deliveryCertified = latestStepSignOff(row.timeline, CERTIFY_DELIVERY_STEP_RE);
  const invoiceVerifiedAny = latestStepSignOff(row.timeline, VERIFY_INVOICE_STEP_RE);
  const acceptedInspections = deliveries.filter((d) =>
    ["ACCEPTED", "PARTIAL"].includes(d.inspection?.status),
  ).length;
  /** @param {string} s */
  const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
  const closureChecklist = [
    {
      id: "order",
      stage: "Order",
      details: activeOrder
        ? `${activeOrder.number} · ${formatMoneyUGX(activeOrder.value)}${orderStatus ? ` · ${titleCase(orderStatus)}` : ""}`
        : "—",
      done: orderDone,
    },
    {
      id: "delivery",
      stage: "Delivery",
      details: deliveries.length
        ? `${deliveries.length} received${allReceived ? " · all items" : " · partial"}`
        : "—",
      done: allReceived,
    },
    {
      id: "inspection",
      stage: "Inspection",
      details: deliveries.length
        ? `${acceptedInspections} of ${deliveries.length} accepted${
            deliveryCertified
              ? ` · certified by ${deliveryCertified.by || "—"} on ${formatPrintDate(deliveryCertified.at)}`
              : ""
          }`
        : "—",
      done: allInspected && acceptedInspections > 0,
    },
    {
      id: "invoice",
      stage: "Invoice",
      details: verifiedInvoices.length
        ? `${verifiedInvoices.map((i) => `${i.invoiceNumber} · ${formatMoneyUGX(i.amount)}`).join(", ")}${
            invoiceVerifiedAny
              ? ` · verified by ${invoiceVerifiedAny.by || "—"} on ${formatPrintDate(invoiceVerifiedAny.at)}`
              : ""
          }`
        : "—",
      done: verifiedInvoices.length > 0,
    },
    {
      id: "payment",
      stage: "Payment",
      details: paidPayments.length
        ? paidPayments
            .map(
              (p) =>
                `${formatMoneyUGX(p.amount)}${p.paymentReference ? ` · ${p.paymentReference}` : ""}${
                  p.paymentDate ? ` · ${formatPrintDate(p.paymentDate)}` : ""
                }`,
            )
            .join(", ")
        : "—",
      done: verifiedInvoices.length > 0 && paidTotal + 0.009 >= invoicedTotal,
    },
  ];

  async function confirmClose() {
    const remarks = closureRemarks.trim() || null;
    const ok = isCloseTask
      ? await submitDeliveryTask({ remarks, comment: remarks || "" }, "Procurement closed.")
      : await runLifecycle("close_procurement", { remarks }, "Procurement closed.");
    if (ok) {
      setCloseConfirmOpen(false);
      setClosureRemarks("");
    }
  }

  async function confirmPaymentSecondary() {
    const reason = rejectReason.trim();
    if (!reason) {
      setPaymentReasonError("Enter a reason.");
      return;
    }
    const ok =
      paymentSecondary === "return"
        ? await submitDeliveryTask({ decision: "RETURN", comment: reason }, "Payment returned.")
        : await runLifecycle("reject_payment", { paymentId: currentPayment?.id, reason }, "Payment rejected.");
    if (ok) {
      setPaymentReasonOpen(false);
      setRejectReason("");
    }
  }

  /**
   * @param {"lpo" | "contract"} kind
   * @param {string} deliveryAddress
   */
  const saveDeliveryAddress = (kind, deliveryAddress) =>
    runLifecycle("update_delivery_address", { kind, deliveryAddress }, "Delivery address updated.");

  const orderDoc = row?.contract || row?.lpo || null;
  const orderAddressLine = orderDoc ? (
    <OrgDeliveryAddressLine
      address={orderDoc.deliveryAddress}
      fallback={requisitionAddress}
      editableKind={["DRAFT", "APPROVED"].includes(orderDoc.status) ? (row.contract ? "contract" : "lpo") : null}
      busy={busy}
      onSave={saveDeliveryAddress}
    />
  ) : null;

  const providerPicker = usesProviderPicker ? (
    <OrgProviderSelection
      projectId={projectId}
      mode={isIssuePi ? "single" : "multi"}
      method={isIssuePi ? "MICRO" : "QUOTATION"}
      category={reqCategory}
      value={isIssuePi ? piSupplierIds : inviteIds}
      onChange={(ids) => {
        setSelectionError("");
        if (isIssuePi) setPiSupplierIds(ids);
        else setInviteIds(ids);
      }}
      locked={piApprovedProvider}
      optionalValidation={piApprovedProvider}
      onQualificationChange={isIssuePi ? setPiProviderFailures : undefined}
      label={
        isIssuePi
          ? approvedShortlistCount > 0
            ? `Approved ${providerWord}`
            : `Select ${providerWord}`
          : `${providerTerm(reqCategory, { plural: true, capitalize: true })} to invite`
      }
      helperText={approvedShortlistCount > 0 ? "Approved by Contracts Committee" : undefined}
      actionLabel={isIssuePi ? "Issue purchase instruction" : `Issue RFQs to ${providerWordPlural}`}
      busy={busy}
      busyLabel={isIssuePi ? "Issuing purchase instruction…" : "Issuing RFQs…"}
      extraWarnings={
        isRfqIssue && inviteIds.length > 0 && inviteIds.length < minRfqProviders(row?.isEmergency)
          ? [
              `Only ${inviteIds.length} invited — RFQ normally invites at least ${row?.isEmergency ? "two" : "three"}.`,
            ]
          : []
      }
      error={selectionError}
      onConfirm={() => submitDecision({ acknowledged: true })}
    />
  ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          component={Link}
          href={
            backHref ||
            (overview ? `/projects/${projectId}/procurements` : procurementStageHref(projectId, procurementId))
          }
          startIcon={<ArrowBackRounded />}
          variant="outlined"
        >
          {backLabel || (overview ? "Back to procurements" : "Back to procurement")}
        </Button>
        <div className="flex flex-wrap gap-2">
          {printPi ? (
            <PrintButton fileName={`Purchase instruction ${piDoc.pi.instructionNumber}`} />
          ) : printStage !== undefined ? (
            <PrintButton
              fileName={`${row.procurementNumber} ${
                printStage ? procurementStageLabel(printStage, row.procurementMethod) : "procurement record"
              }`}
            />
          ) : null}
          <Button startIcon={<RefreshRounded />} variant="outlined" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>
      {printPi ? (
        <PurchaseInstructionPrint doc={piDoc} row={row} printedBy={printedBy} />
      ) : printStage !== undefined ? (
        <ProcurementPrint
          row={row}
          sections={sections}
          stage={printStage}
          piDoc={piDoc}
          organisation={organisation}
          printedBy={printedBy}
          recommendations={recommendations}
        />
      ) : null}

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {!overview ? (
              <Typography variant="overline" sx={{ color: "primary.main", fontWeight: 700, lineHeight: 1.6 }}>
                {procurementStageLabel(stage, row.procurementMethod)}
              </Typography>
            ) : null}
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {row.title}
            </Typography>
            <Typography variant="body2" sx={adminMutedTextSx}>
              {row.procurementNumber}
            </Typography>
          </div>
          <div className="flex flex-wrap gap-1">
            {row.isEmergency ? (
              <Chip size="small" color="warning" label="Emergency" title="From an emergency procurement plan" />
            ) : null}
            {row.procurementMethod ? (
              <Chip
                size="small"
                color="info"
                variant="outlined"
                label={procurementMethodLabel(row.procurementMethod)}
              />
            ) : null}
            <Chip size="small" color={row.statusColor || "info"} label={row.statusLabel || row.status} />
          </div>
        </div>

        <RecordDetailsGrid fields={procurementDetailFields(row, projectId, activeOrder)} />

        {blockedTask ? (
          <Alert severity="warning" variant="outlined" sx={{ mt: 2 }}>
            {blockedTask.message}
          </Alert>
        ) : null}
      </Paper>

      {taskStage && taskStage !== stage ? (
        <Alert
          severity="info"
          variant="outlined"
          icon={<AssignmentTurnedInRounded />}
          action={
            <Button
              component={Link}
              href={procurementStageHref(projectId, procurementId, taskStage, row.procurementMethod)}
              variant="contained"
              size="small"
            >
              Open task
            </Button>
          }
        >
          <span className="font-semibold">Your turn:</span>{" "}
          {taskStage === "recommendation"
            ? procurementStageLabel("recommendation", row.procurementMethod)
            : taskTitle.split(":")[0]}
        </Alert>
      ) : null}

      {overview || on("recommendation") || recommendation?.pending ? (
        <OrgRecommendationsCard
          projectId={projectId}
          procurementId={procurementId}
          recommendations={recommendations}
          canDecide={on("recommendation") && Boolean(recommendation?.canDecide)}
          waitingForCommittee={Boolean(recommendation?.pending)}
          onDecided={async () => {
            notifyOrgTasksChanged(projectId);
            await load();
          }}
        />
      ) : null}

      {!overview &&
      !showTaskCard &&
      stage !== "task" &&
      stage !== "recommendation" &&
      sections &&
      !sections[stage]?.view ? (
        <Typography variant="body2" sx={adminMutedTextSx}>
          This stage is not visible to your role.
        </Typography>
      ) : null}

      {overview ? (
        <ProcurementStageCards
          projectId={projectId}
          row={row}
          sections={sections}
          taskStage={taskStage}
          summaries={stageSummaries}
        />
      ) : null}

      {showTaskCard ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            {pendingTask.title.split(":")[0].replace(/\s+where applicable$/i, "")}
          </Typography>
          {taskPhaseOff ? (
            <Chip size="small" color="warning" label={taskPhaseOffTitle} sx={{ mb: 1 }} />
          ) : null}
          {piApprovedProvider ? <div className="mb-3">{providerPicker}</div> : null}
          {isPrepareDocsTask || isReviewDocsTask || ((isTenderAdvertise || isRfqIssue) && usesBidDocument) ? (
            <div className="mb-3">{bidDocumentSection(isPrepareDocsTask)}</div>
          ) : null}
          {evalInTaskCard ? (
            <div className="mb-3">
              <OrgEvaluationPanel
                ref={evalPanelRef}
                projectId={projectId}
                procurement={row}
                providerWord={providerWord}
                onChanged={() => void load()}
                step={evalStep}
                stepActionLabel={stepActionLabel}
                onStepAction={() => submitDecision({ acknowledged: true })}
                onStepActionInsideChange={setEvalActionInside}
                hideStepAction={!isPositiveDecision}
                stepBusy={busy}
                phaseLocked={taskPhaseOff}
              />
            </div>
          ) : null}
          {isReceive && latestSolicitation && !latestSolicitation.openedAt ? (
            <div className="mb-3">
              <OrgSubmissionWindow
                projectId={projectId}
                taskId={pendingTask.id}
                solicitation={latestSolicitation}
                isTender={bidding}
                busy={busy}
                setBusy={setBusy}
                onChanged={load}
              />
              <OrgReopenSubmissionsDialog
                open={reopenOpen}
                onClose={() => setReopenOpen(false)}
                projectId={projectId}
                taskId={pendingTask.id}
                solicitation={latestSolicitation}
                isTender={bidding}
                busy={busy}
                setBusy={setBusy}
                onChanged={async () => {
                  setDecision(defaultWorkflowDecision(actionKey));
                  await load();
                }}
              />
            </div>
          ) : null}
          {orderInTaskCard ? (
            <div className="mb-4">
              <OrgOrderSummary row={row} addressSlot={orderAddressLine} />
            </div>
          ) : null}
          {awardInTaskCard ? (
            <div className="mb-4">
              {isPrepareOrderTask ? <OrgAwardOrderBasis row={row} /> : <OrgAwardDetails row={row} />}
            </div>
          ) : null}
          {isForwardBidsTask ? (
            <div className="mb-4 space-y-3">
              <RecordDetailsGrid
                fields={[
                  { label: "Closed on", value: dateOrNull(latestSolicitation?.closingDate) },
                  { label: "Opened on", value: dateOrNull(latestSolicitation?.openedAt) },
                  { label: "Opened by", value: openedSignOff?.by || null },
                  {
                    label: "Bids received",
                    value: `${offers.filter((o) => o.status !== "WITHDRAWN" && o.status !== "LATE").length} valid of ${offers.length}`,
                  },
                ]}
              />
              <OrgOffersCard offers={offers} providerWord={providerWord} />
            </div>
          ) : null}
          {isReceive ? (
            <div className="mb-4">
              <OrgReceiveOffersPanel
                projectId={projectId}
                procurementId={procurementId}
                taskId={pendingTask.id}
                decision={defaultWorkflowDecision(actionKey)}
                clarifyAllowed={clarifyAllowed}
                isTender={bidding}
                providerWord={providerWord}
                providerWordPlural={providerWordPlural}
                offers={offers}
                quotePool={quotePool}
                busy={busy}
                setBusy={setBusy}
                onChanged={load}
              />
            </div>
          ) : null}
          {receivingOpen ? null : (
          <div className="grid gap-3 sm:grid-cols-2">
            {isPrepareDocsTask || taskDecisionOptions.length < 2 ? null : (
              <TextField
                select
                label="Decision"
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              >
                {taskDecisionOptions.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {workflowDecisionLabelForTask(opt, taskTitle)}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {isTenderAdvertise ? (
              <Alert severity="info" variant="outlined" className="sm:col-span-2">
                Open tender — visible to all active {providerWordPlural}.
              </Alert>
            ) : null}

            {isIssuePi && isPositiveDecision ? (
              <>
                <TextField
                  label="Deliver by"
                  type="date"
                  value={piTerms.requiredDeliveryDate}
                  onChange={(e) => {
                    setPiTerms((t) => ({ ...t, requiredDeliveryDate: e.target.value }));
                    setPiErrors((p) => ({ ...p, requiredDeliveryDate: "" }));
                  }}
                  error={Boolean(piErrors.requiredDeliveryDate)}
                  helperText={piErrors.requiredDeliveryDate || " "}
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: toDateInputValue(new Date()) } }}
                  sx={themedTextFieldSx}
                />
                <TextField
                  label="Payment terms"
                  value={piTerms.paymentTerms}
                  onChange={(e) => {
                    setPiTerms((t) => ({ ...t, paymentTerms: e.target.value }));
                    setPiErrors((p) => ({ ...p, paymentTerms: "" }));
                  }}
                  error={Boolean(piErrors.paymentTerms)}
                  helperText={piErrors.paymentTerms || " "}
                  fullWidth
                  multiline
                  minRows={2}
                  className="sm:col-span-2"
                  sx={themedTextFieldSx}
                />
                <TextField
                  label="Special instructions"
                  value={piTerms.specialInstructions}
                  onChange={(e) => {
                    setPiTerms((t) => ({ ...t, specialInstructions: e.target.value }));
                    setPiErrors((p) => ({ ...p, specialInstructions: "" }));
                  }}
                  error={Boolean(piErrors.specialInstructions)}
                  helperText={piErrors.specialInstructions || "Optional"}
                  fullWidth
                  multiline
                  minRows={2}
                  className="sm:col-span-2"
                  sx={themedTextFieldSx}
                />
              </>
            ) : null}

            {(isRfqIssue || isTenderAdvertise) && latestSolicitation?.closingDate ? (
              <TextField
                label="Closing date"
                value={formatPrintDate(latestSolicitation.closingDate)}
                helperText="Approved by Contracts Committee"
                fullWidth
                slotProps={{ input: { readOnly: true } }}
                sx={themedTextFieldSx}
              />
            ) : isRfqIssue || isTenderAdvertise ? (
              <TextField
                label="Closing date"
                type="datetime-local"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                sx={themedTextFieldSx}
              />
            ) : null}

            {isPrepareContractTask && isPositiveDecision ? (
              <>
                <TextField
                  label="Contract start date"
                  type="date"
                  value={contractStart}
                  onChange={(e) => {
                    setContractStart(e.target.value);
                    setContractDateErrors({});
                  }}
                  error={Boolean(contractDateErrors.startDate)}
                  helperText={contractDateErrors.startDate || " "}
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={themedTextFieldSx}
                />
                <TextField
                  label="Contract end date"
                  type="date"
                  value={contractEnd}
                  onChange={(e) => {
                    setContractEnd(e.target.value);
                    setContractDateErrors({});
                  }}
                  error={Boolean(contractDateErrors.endDate)}
                  helperText={
                    contractDateErrors.endDate || (contractDeliveryDays ? `Bid delivery period: ${contractDeliveryDays} days` : " ")
                  }
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={themedTextFieldSx}
                />
              </>
            ) : null}

            {isApproveAwardTask && isPositiveDecision ? (
              <TextField
                label="Approval reference"
                value={approvalReference}
                onChange={(e) => {
                  setApprovalReference(e.target.value);
                  setApprovalReferenceError("");
                }}
                error={Boolean(approvalReferenceError)}
                helperText={approvalReferenceError || "Optional · e.g. CC minute no."}
                fullWidth
                sx={themedTextFieldSx}
              />
            ) : null}

            {decision === "REOPEN" || evalReportStep ? null : (
            <TextField
              label={decision === "RETURN" || decision === "REJECT" ? "Comment" : "Comment (optional)"}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setCommentError("");
              }}
              fullWidth
              multiline
              minRows={2}
              className="sm:col-span-2"
              error={Boolean(commentError)}
              helperText={commentError || undefined}
              sx={themedTextFieldSx}
            />
            )}
          </div>
          )}
          {usesProviderPicker && !piApprovedProvider ? (
            <div className="mt-3">{providerPicker}</div>
          ) : null}
          {receiveBlocker && !receivingOpen ? (
            <div className="mt-3 flex sm:justify-end" role="status">
              <Chip
                size="small"
                color="warning"
                label={receiveBlocker}
                sx={{ height: "auto", "& .MuiChip-label": { whiteSpace: "normal", py: 0.5 } }}
              />
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap-reverse items-center justify-between gap-2">
            {recommendation?.canRecommend ? (
              <Tooltip title="Sent to the Contracts Committee for decision">
                <span>
                  <Button
                    variant="text"
                    size="small"
                    color="warning"
                    startIcon={<GavelRounded fontSize="small" />}
                    onClick={() => setRecommendOpen(true)}
                    disabled={busy}
                    sx={{ textTransform: "none" }}
                  >
                    {recommendActionLabel(recommendation?.kinds)}
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <span />
            )}
            {(!usesProviderPicker || piApprovedProvider) && !stepActionInsidePanel && !receivingOpen ? (
              <Tooltip
                title={
                  taskPhaseOff
                    ? taskPhaseOffTitle
                    : isPrepareDocsTask
                      ? `Save the ${bidDocWord.toLowerCase()} and send it for review`
                      : receiveBlocker
                }
              >
                <span className="w-full sm:w-auto">
                  <Button
                    variant="contained"
                    color={decision === "REJECT" ? "error" : "primary"}
                    disabled={busy || Boolean(receiveBlocker) || taskPhaseOff}
                    onClick={() => void submitDecision()}
                    startIcon={
                      busy ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : isPrepareDocsTask ? (
                        <SendRounded />
                      ) : decision === "REOPEN" ? (
                        <LockOpenRounded />
                      ) : null
                    }
                    className="w-full sm:w-auto"
                  >
                    {busy
                      ? workflowDecisionButtonLabel(decision, { busy })
                      : isPrepareDocsTask
                        ? "Submit for review"
                        : decision === "REOPEN"
                          ? `Reopen ${offerWord}`
                        : stepActionLabel && isPositiveDecision
                          ? stepActionLabel
                          : decision === "COMPLETE"
                            ? "Complete & forward"
                            : workflowDecisionButtonLabel(decision, { busy })}
                  </Button>
                </span>
              </Tooltip>
            ) : null}
          </div>
        </Paper>
      ) : null}

      {piDoc && (overview || on("contract")) ? <PurchaseInstructionView doc={piDoc} /> : null}

      {on("sourcing") || sourcingOnOverview ? (
      <ProcurementSectionGate access={sections?.sourcing}>
      {latestSolicitation || usesBidDocument ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Solicitation
            </Typography>
            {solicitationChip ? (
              <Chip size="small" color={solicitationChip.color} label={solicitationChip.label} />
            ) : null}
          </div>
          {latestSolicitation ? (
            <div className="mb-3 grid gap-3 text-sm sm:grid-cols-4">
              <div className="sm:col-span-2">
                <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                  Type
                </Typography>
                {latestSolicitation.solicitationType === "TENDER" ? "Tender" : "Request for Quotations (RFQ)"}
              </div>
              <div>
                <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                  {submissionsOpen(latestSolicitation) ? "Closes" : "Closed"}
                </Typography>
                {latestSolicitation.closingDate ? formatPrintDate(latestSolicitation.closingDate) : "—"}
              </div>
              <div>
                <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                  Invited
                </Typography>
                {latestSolicitation.solicitationType === "TENDER"
                  ? "Open to all"
                  : (latestSolicitation.invites || []).length || "—"}
              </div>
            </div>
          ) : null}
          {latestSolicitation?.solicitationType === "RFQ" && latestSolicitation.invites?.length ? (
            <OrgInvitedProvidersList
              invites={latestSolicitation.invites}
              offers={offers}
              providerWordPlural={providerWordPlural}
            />
          ) : null}
          {usesBidDocument && !docInTaskCard ? bidDocumentSection(false) : null}
        </Paper>
      ) : null}

      {showTaskCard && (isReceive || isForwardBidsTask) ? null : (
        <OrgOffersCard
          offers={offers}
          providerWord={providerWord}
          projectId={projectId}
          procurementId={procurementId}
          clarifyAllowed={clarifyAllowed && on("sourcing")}
          onChanged={load}
        />
      )}
      </ProcurementSectionGate>
      ) : null}

      {on("evaluation") &&
      !evalInTaskCard &&
      isCompetitiveMethod(row.procurementMethod) &&
      (!sections || sections.evaluation?.view) ? (
        <OrgEvaluationPanel
          projectId={projectId}
          procurement={row}
          providerWord={providerWord}
          onChanged={() => void load()}
        />
      ) : null}

      {!isMicroStyleMethod(row.procurementMethod) ? (
        <>
          {on("award") &&
          (row.award ? !awardInTaskCard || awardCancellable : !(evalInTaskCard && evalStep === "award")) ? (
          <ProcurementSectionGate access={sections?.award}>
          <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Award
            </Typography>
            {row.award ? (
              <div className="space-y-3 text-sm">
                {awardInTaskCard ? null : <OrgAwardDetails row={row} />}
                <div className="flex flex-wrap gap-2">
                  {row.award.status === "APPROVED" && !awardInWorkflow && awardMay("communicate_award") ? (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        void confirmThen("Communicate award", () =>
                          runLifecycle("communicate_award", { awardId: row.award.id }),
                        )
                      }
                    >
                      Communicate award
                    </Button>
                  ) : null}
                  {awardCancellable ? (
                    <div className="flex w-full flex-wrap items-end gap-2 pt-1">
                      <TextField
                        label="Cancel reason"
                        value={cancelAwardReason}
                        onChange={(e) => setCancelAwardReason(e.target.value)}
                        size="small"
                        sx={{ ...themedTextFieldSx, minWidth: 200, flex: 1 }}
                      />
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        disabled={busy || !cancelAwardReason.trim()}
                        onClick={() =>
                          void confirmThen(
                            "Cancel award",
                            () =>
                              runLifecycle("cancel_award", {
                                awardId: row.award.id,
                                reason: cancelAwardReason.trim(),
                              }),
                            "error",
                          )
                        }
                      >
                        Cancel award
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <OrgAwardRecommendationSummary row={row} />
                {!awardInWorkflow && awardMay("create_award") ? (
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy || row.status === "CLOSED"}
                    onClick={() => void confirmThen("Create award", () => runLifecycle("create_award"))}
                  >
                    Create award from evaluation
                  </Button>
                ) : null}
              </div>
            )}
          </Paper>
          </ProcurementSectionGate>
          ) : null}

          {on("contract") && !orderInTaskCard && (row.lpo || row.contract || !contractInWorkflow) ? (
          <ProcurementSectionGate access={sections?.contract}>
          <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              {methodUsesContract(row.procurementMethod) ? "Contract" : "Local purchase order"}
            </Typography>
            {orderOff ? (
              <Chip size="small" color="warning" label={orderOffTitle} sx={{ mb: 1 }} />
            ) : null}
            {row.lpo ? (
              <div className="space-y-2 text-sm">
                <OrgOrderSummary row={row} addressSlot={orderAddressLine} />
                <div className="flex flex-wrap gap-2">
                  {row.lpo.status === "DRAFT" && !contractInWorkflow ? (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy || orderOff}
                      onClick={() =>
                        void confirmThen("Approve LPO", () => runLifecycle("approve_lpo", { lpoId: row.lpo.id }))
                      }
                    >
                      Approve LPO
                    </Button>
                  ) : null}
                  {row.lpo.status === "APPROVED" && !contractInWorkflow ? (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy || orderOff}
                      onClick={() =>
                        void confirmThen("Issue LPO", () => runLifecycle("issue_lpo", { lpoId: row.lpo.id }))
                      }
                    >
                      Issue LPO
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : row.contract ? (
              <div className="space-y-2 text-sm">
                <OrgOrderSummary row={row} addressSlot={orderAddressLine} />
                <div className="flex flex-wrap gap-2">
                  {row.contract.status === "DRAFT" && !contractInWorkflow ? (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy || orderOff}
                      onClick={() =>
                        void confirmThen("Approve contract", () =>
                          runLifecycle("approve_contract", { contractId: row.contract.id }),
                        )
                      }
                    >
                      Approve contract
                    </Button>
                  ) : null}
                  {row.contract.status === "APPROVED" && !contractInWorkflow ? (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy || orderOff}
                      onClick={() =>
                        void confirmThen("Sign contract", () =>
                          runLifecycle("sign_contract", { contractId: row.contract.id }),
                        )
                      }
                    >
                      Sign contract
                    </Button>
                  ) : null}
                  {row.contract.status === "SIGNED" && !contractInWorkflow ? (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy || orderOff}
                      onClick={() =>
                        void confirmThen("Issue contract", () =>
                          runLifecycle("issue_contract", { contractId: row.contract.id }),
                        )
                      }
                    >
                      Issue contract
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {methodUsesLpo(row.procurementMethod) ? (
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy || orderOff || !row.award || row.award.status !== "ACCEPTED"}
                    onClick={() => void confirmThen("Create LPO", () => runLifecycle("create_lpo"))}
                    title={
                      row.award?.status === "ACCEPTED"
                        ? "Create LPO"
                        : "Accept the award before creating an LPO"
                    }
                  >
                    Create LPO
                  </Button>
                ) : null}
                {methodUsesContract(row.procurementMethod) ? (
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy || orderOff || !row.award || row.award.status !== "ACCEPTED"}
                    onClick={() =>
                      void confirmThen("Create contract", () =>
                        runLifecycle("create_contract", { startDate: contractStart, endDate: contractEnd }),
                      )
                    }
                  >
                    Create contract
                  </Button>
                ) : null}
              </div>
            )}
          </Paper>
          </ProcurementSectionGate>
          ) : null}
        </>
      ) : null}

      {on("delivery") ? (
      <ProcurementSectionGate access={sections?.delivery}>
      <div className="space-y-3">
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Receive goods
            </Typography>
            {allReceived ? (
              <Chip size="small" color="success" label="Received" />
            ) : pendingDeliveryNote ? (
              <Chip size="small" color="info" label="Dispatched" />
            ) : orderNotOpen ? (
              <Chip size="small" color="warning" variant="outlined" label="Awaiting acceptance" />
            ) : (
              <Chip size="small" color="warning" variant="outlined" label="Awaiting delivery" />
            )}
          </div>

          {pendingDeliveryNote ? (
            <>
              <RecordDetailsGrid
                fields={[
                  { label: "Delivery note", value: pendingDeliveryNote.noteNumber },
                  {
                    label: providerWord.charAt(0).toUpperCase() + providerWord.slice(1),
                    value: pendingDeliveryNote.supplier?.name || activeOrder?.supplierName || null,
                  },
                  { label: "Dispatched", value: formatPrintDate(pendingDeliveryNote.dispatchedAt) },
                  { label: "Order", value: activeOrder?.number || null },
                  { label: "Delivered by", value: pendingDeliveryNote.deliveredBy },
                  { label: "Vehicle no.", value: pendingDeliveryNote.vehicleNumber },
                  ...(pendingDeliveryNote.remarks
                    ? [{ label: "Remarks", value: pendingDeliveryNote.remarks, full: true }]
                    : []),
                ]}
              />
              <div className="mt-3">
                <OrgLineItemsTable
                  rows={pendingDeliveryNote.lines}
                  getRowKey={(l) => l.itemName}
                  columns={[
                    { id: "n", label: "#", render: (_l, i) => i + 1 },
                    { id: "itemName", label: "Item" },
                    {
                      id: "ordered",
                      label: "Ordered",
                      align: "right",
                      render: (l) => orderedQtyLabel(l.itemName),
                    },
                    {
                      id: "quantity",
                      label: "Dispatched",
                      align: "right",
                      render: (l) => `${formatMoneyAmount(l.quantity)}${l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ""}`,
                    },
                    ...(canReceiveGoods
                      ? [
                          {
                            id: "received",
                            label: "Received",
                            align: /** @type {"right"} */ ("right"),
                            render: (/** @type {any} */ l) => (
                              <TextField
                                aria-label={`Received quantity for ${l.itemName}`}
                                value={deliveryQtys[l.itemName] ?? formatMoneyAmount(l.quantity)}
                                onChange={(e) => {
                                  setDeliveryQtys((prev) => ({ ...prev, [l.itemName]: e.target.value }));
                                  setReceiveErrors((prev) => ({ ...prev, [l.itemName]: "" }));
                                }}
                                error={Boolean(receiveErrors[l.itemName])}
                                helperText={receiveErrors[l.itemName] || undefined}
                                sx={{ ...themedTextFieldSx, width: 120 }}
                                slotProps={{ htmlInput: { inputMode: "decimal", style: { textAlign: "right" } } }}
                              />
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
              {canReceiveGoods ? (
                <div className="mt-3 grid gap-x-3 sm:grid-cols-[12rem_1fr]">
                  <TextField
                    label="Date received"
                    type="date"
                    value={receivedOn}
                    onChange={(e) => {
                      setReceivedOn(e.target.value);
                      setReceiveErrors((prev) => ({ ...prev, receivedOn: "" }));
                    }}
                    error={Boolean(receiveErrors.receivedOn)}
                    helperText={receiveErrors.receivedOn || " "}
                    fullWidth
                    sx={themedTextFieldSx}
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: {
                        min: toDateInputValue(pendingDeliveryNote.dispatchedAt),
                        max: toDateInputValue(new Date()),
                      },
                    }}
                  />
                  <TextField
                    label="Condition / remarks"
                    value={receiveRemarks}
                    onChange={(e) => {
                      setReceiveRemarks(e.target.value);
                      setReceiveErrors((prev) => ({ ...prev, receiveRemarks: "" }));
                    }}
                    error={Boolean(receiveErrors.receiveRemarks)}
                    helperText={receiveErrors.receiveRemarks || "Optional"}
                    fullWidth
                    sx={themedTextFieldSx}
                  />
                </div>
              ) : null}
              {canReceiveGoods ? (
                <div className="mt-1 flex justify-end">
                  <Button
                    variant="contained"
                    startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleRounded />}
                    disabled={busy}
                    onClick={() => void receiveGoods()}
                    className="w-full sm:w-auto"
                  >
                    Confirm receipt
                  </Button>
                </div>
              ) : (
                <Typography variant="body2" sx={{ ...adminMutedTextSx, mt: 1 }}>
                  Awaiting receipt by the user department.
                </Typography>
              )}
            </>
          ) : allReceived ? null : (
            <Typography variant="body2" sx={{ ...adminMutedTextSx, mt: 1 }}>
              {orderNotOpen ||
                (deliveries.length
                  ? `Waiting for the next delivery from ${orderProvider}.`
                  : `Waiting for ${orderProvider} to deliver.`)}
            </Typography>
          )}

          {deliveries.length ? (
            <div className="mt-3">
              <OrgLineItemsTable
                title="Received"
                rows={deliveries.flatMap((d) =>
                  (d.lines || []).map((l) => ({
                    id: l.id,
                    date: d.deliveryDate ? formatPrintDate(d.deliveryDate) : "—",
                    note: d.deliveryNote?.noteNumber || "—",
                    item: l.itemName,
                    received: `${formatMoneyAmount(l.receivedQuantity)}${l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ""}`,
                    ordered: `${formatMoneyAmount(l.orderedQuantity)}${l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ""}`,
                    by: d.recordedBy?.displayName || "—",
                    remarks: d.remarks && !/^Received against /.test(d.remarks) ? d.remarks : "—",
                  })),
                )}
                columns={[
                  { id: "date", label: "Date received" },
                  { id: "note", label: "Delivery note" },
                  { id: "item", label: "Item" },
                  { id: "received", label: "Received", align: "right" },
                  { id: "ordered", label: "Ordered", align: "right" },
                  { id: "by", label: "Received by" },
                  { id: "remarks", label: "Remarks" },
                ]}
              />
            </div>
          ) : null}

          {isReceiveGoodsTask && !pendingDeliveryNote && deliveries.length ? (
            <div className="mt-3 flex justify-end">
              <Button
                variant="contained"
                startIcon={<CheckCircleRounded />}
                disabled={busy}
                onClick={() => void confirmThen("Confirm receipt", () => submitDeliveryTask({}, "Goods received."))}
                className="w-full sm:w-auto"
              >
                Confirm receipt
              </Button>
            </div>
          ) : null}
        </Paper>

        {deliveries.length ? (
          <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Inspect &amp; accept goods
              </Typography>
              {allInspected ? (
                <Chip size="small" color="success" label="Inspected" />
              ) : (
                <Chip size="small" color="warning" variant="outlined" label="Awaiting inspection" />
              )}
            </div>

            {deliveries
              .filter((d) => !d.inspection)
              .map((d) => (
                <div key={d.id} className="mt-3 space-y-3">
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {d.deliveryNote?.noteNumber || "Delivery"}
                    {d.deliveryDate ? ` · received ${formatPrintDate(d.deliveryDate)}` : ""}
                  </Typography>
                  {canInspectGoods ? (
                    <>
                      <OrgLineItemsTable
                        rows={d.lines || []}
                        columns={[
                          { id: "n", label: "#", render: (_l, i) => i + 1 },
                          { id: "itemName", label: "Item" },
                          {
                            id: "receivedQuantity",
                            label: "Received",
                            align: "right",
                            render: (l) =>
                              `${formatMoneyAmount(l.receivedQuantity)}${l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ""}`,
                          },
                          ...["accepted", "rejected"].map((field) => ({
                            id: field,
                            label: field === "accepted" ? "Accepted" : "Rejected",
                            align: /** @type {"right"} */ ("right"),
                            render: (/** @type {any} */ l) => {
                              const edit = inspectionLineEdits[l.id] || {
                                accepted: formatMoneyAmount(l.receivedQuantity),
                                rejected: "0",
                              };
                              return (
                                <TextField
                                  aria-label={`${field === "accepted" ? "Accepted" : "Rejected"} quantity for ${l.itemName}`}
                                  value={edit[field]}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    const n = Number(value);
                                    const other = field === "accepted" ? "rejected" : "accepted";
                                    const rest = Number(l.receivedQuantity) - n;
                                    setInspectionLineEdits((prev) => ({
                                      ...prev,
                                      [l.id]: {
                                        ...edit,
                                        [field]: value,
                                        ...(value.trim() && Number.isFinite(n) && rest >= 0
                                          ? { [other]: formatMoneyAmount(rest) }
                                          : {}),
                                      },
                                    }));
                                    setInspectionErrors((prev) => ({
                                      ...prev,
                                      [`${l.id}:accepted`]: "",
                                      [`${l.id}:rejected`]: "",
                                    }));
                                  }}
                                  error={Boolean(inspectionErrors[`${l.id}:${field}`])}
                                  helperText={inspectionErrors[`${l.id}:${field}`] || undefined}
                                  sx={{ ...themedTextFieldSx, width: 110 }}
                                  slotProps={{ htmlInput: { inputMode: "decimal", style: { textAlign: "right" } } }}
                                />
                              );
                            },
                          })),
                        ]}
                      />
                      <TextField
                        label="Inspection notes"
                        value={inspectionNotes}
                        onChange={(e) => {
                          setInspectionNotes(e.target.value);
                          setInspectionErrors((prev) => ({ ...prev, inspectionNotes: "" }));
                        }}
                        error={Boolean(inspectionErrors.inspectionNotes)}
                        helperText={
                          inspectionErrors.inspectionNotes ||
                          ((d.lines || []).some((l) => Number(inspectionLineEdits[l.id]?.rejected) > 0)
                            ? "Reason for rejection"
                            : "Optional")
                        }
                        fullWidth
                        multiline
                        minRows={2}
                        sx={themedTextFieldSx}
                      />
                      <div className="flex justify-end">
                        <Button
                          variant="contained"
                          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <FactCheckRounded />}
                          disabled={busy || !(d.lines || []).length}
                          onClick={() => void inspectDelivery(d)}
                          className="w-full sm:w-auto"
                        >
                          Confirm inspection
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Typography variant="body2" sx={adminMutedTextSx}>
                      Awaiting inspection.
                    </Typography>
                  )}
                </div>
              ))}

            {deliveries.some((d) => d.inspection) ? (
              <div className="mt-3">
                <OrgLineItemsTable
                  title="Inspected"
                  rows={deliveries
                    .filter((d) => d.inspection)
                    .flatMap((d) =>
                      (d.lines || []).map((l) => ({
                        id: l.id,
                        note: d.deliveryNote?.noteNumber || "—",
                        item: l.itemName,
                        received: formatMoneyAmount(l.receivedQuantity),
                        accepted: formatMoneyAmount(l.acceptedQuantity),
                        rejected: formatMoneyAmount(l.rejectedQuantity),
                        status: d.inspection.status,
                        by: d.inspection.inspectedBy?.displayName || "—",
                        on: d.inspection.inspectedAt ? formatPrintDate(d.inspection.inspectedAt) : "—",
                      })),
                    )}
                  columns={[
                    { id: "on", label: "Inspected on" },
                    { id: "note", label: "Delivery note" },
                    { id: "item", label: "Item" },
                    { id: "received", label: "Received", align: "right" },
                    { id: "accepted", label: "Accepted", align: "right" },
                    { id: "rejected", label: "Rejected", align: "right" },
                    {
                      id: "status",
                      label: "Result",
                      render: (r) => (
                        <Chip
                          size="small"
                          variant="outlined"
                          color={r.status === "ACCEPTED" ? "success" : r.status === "REJECTED" ? "error" : "warning"}
                          label={r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                        />
                      ),
                    },
                    { id: "by", label: "Inspected by" },
                  ]}
                />
                {deliveries
                  .filter((d) => d.inspection?.resultNotes)
                  .map((d) => (
                    <Typography key={d.id} variant="body2" sx={{ ...adminMutedTextSx, mt: 1 }}>
                      {d.deliveryNote?.noteNumber ? `${d.deliveryNote.noteNumber}: ` : ""}
                      {d.inspection.resultNotes}
                    </Typography>
                  ))}
              </div>
            ) : null}

            {allInspected ? (
              <div className="mt-3 space-y-3">
                <OrgLineItemsTable
                  title="Delivery against order"
                  rows={reqItems.map((it) => {
                    const accepted = deliveries
                      .filter((d) => d.inspection)
                      .flatMap((d) => d.lines || [])
                      .filter((l) => l.itemName === it.itemName)
                      .reduce((sum, l) => sum + (Number(l.acceptedQuantity) || 0), 0);
                    const outstanding = Math.max(0, Number(it.quantity) - accepted);
                    return { id: it.itemName, item: it.itemName, unit: it.unitOfMeasure, ordered: it.quantity, accepted, outstanding };
                  })}
                  columns={[
                    { id: "item", label: "Item" },
                    {
                      id: "ordered",
                      label: "Ordered",
                      align: "right",
                      render: (r) => `${formatMoneyAmount(r.ordered)}${r.unit ? ` ${r.unit}` : ""}`,
                    },
                    { id: "accepted", label: "Accepted", align: "right", render: (r) => formatMoneyAmount(r.accepted) },
                    {
                      id: "outstanding",
                      label: "Outstanding",
                      align: "right",
                      render: (r) => formatMoneyAmount(r.outstanding),
                    },
                    {
                      id: "status",
                      label: "Status",
                      render: (r) => (
                        <Chip
                          size="small"
                          variant="outlined"
                          color={r.outstanding > 0.009 ? "warning" : "success"}
                          label={r.outstanding > 0.009 ? "Partly delivered" : "Complete"}
                        />
                      ),
                    },
                  ]}
                />
                <OrgAwardDecisionTrail timeline={row.timeline} stage="delivery" />
              </div>
            ) : null}

            {isAcceptGoodsTask && allInspected ? (
              <div className="mt-3 space-y-2">
                <TextField
                  label="Comment"
                  value={certifyComment}
                  onChange={(e) => setCertifyComment(e.target.value)}
                  helperText="Optional"
                  fullWidth
                  multiline
                  minRows={2}
                  sx={themedTextFieldSx}
                />
                <div className="flex justify-end">
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleRounded />}
                    disabled={busy}
                    onClick={() =>
                      void confirmThen(isCertifyStep ? "Certify delivery" : "Accept delivery", async () => {
                        const ok = await submitDeliveryTask(
                          { comment: certifyComment.trim() },
                          isCertifyStep ? "Delivery certified." : "Delivery accepted.",
                        );
                        if (ok) setCertifyComment("");
                        return ok;
                      }, "success")
                    }
                    className="w-full sm:w-auto"
                  >
                    {isCertifyStep ? "Certify delivery" : "Accept delivery"}
                  </Button>
                </div>
              </div>
            ) : null}
          </Paper>
        ) : null}
      </div>
      </ProcurementSectionGate>
      ) : null}

      {on("invoice") ? (
      <ProcurementSectionGate access={sections?.invoice}>
      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Invoice
          </Typography>
          {openInvoice && openInvoice.status !== "VERIFIED" ? (
            <Chip
              size="small"
              color="info"
              label={openInvoice.status === "CERTIFIED" ? "Certified" : "Received"}
            />
          ) : latestInvoice && latestInvoice.status !== "REJECTED" ? (
            <Chip size="small" color="success" label="Verified" />
          ) : (
            <Chip size="small" color="warning" variant="outlined" label="Awaiting invoice" />
          )}
        </div>

        {openInvoice ? (
          <>
            <RecordDetailsGrid
              fields={[
                { label: "Invoice no.", value: openInvoice.invoiceNumber },
                ...(openInvoice.supplierReference
                  ? [
                      {
                        label: `${providerWord.charAt(0).toUpperCase()}${providerWord.slice(1)} ref`,
                        value: openInvoice.supplierReference,
                      },
                    ]
                  : []),
                {
                  label: providerWord.charAt(0).toUpperCase() + providerWord.slice(1),
                  value: openInvoice.supplier?.name || activeOrder?.supplierName || null,
                },
                {
                  label: "Date",
                  value: formatPrintDate(openInvoice.invoiceDate || openInvoice.createdAt),
                },
                { label: "Amount", value: formatMoneyUGX(openInvoice.amount) },
                { label: "Order", value: activeOrder?.number || null },
                { label: "Source", value: <SubmissionSourceChip source={openInvoice.source} /> },
                ...(openInvoice.deliveryAddress
                  ? [{ label: "Delivered to", value: openInvoice.deliveryAddress, full: true }]
                  : []),
                ...(openInvoice.notes ? [{ label: "Notes", value: openInvoice.notes, full: true }] : []),
              ]}
            />
            {invoiceMatch ? (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Three-way match
                  </Typography>
                  <Chip size="small" color={invoiceMatch.result.color} label={invoiceMatch.result.label} />
                </div>
                <OrgLineItemsTable
                  rows={invoiceMatch.lines}
                  getRowKey={(l) => l.itemName}
                  columns={[
                    { id: "itemName", label: "Item" },
                    {
                      id: "ordered",
                      label: activeOrder?.kind ? `Ordered (${activeOrder.kind})` : "Ordered",
                      align: "right",
                      render: (l) => `${formatMoneyAmount(l.ordered)}${l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ""}`,
                    },
                    {
                      id: "accepted",
                      label: "Accepted",
                      align: "right",
                      render: (l) => `${formatMoneyAmount(l.accepted)}${l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ""}`,
                    },
                    {
                      id: "unitPrice",
                      label: "Unit price",
                      align: "right",
                      render: (l) => (l.unitPrice === null ? "—" : formatMoneyUGX(l.unitPrice)),
                    },
                    {
                      id: "acceptedValue",
                      label: "Accepted value",
                      align: "right",
                      render: (l) => (l.acceptedValue === null ? "—" : formatMoneyUGX(l.acceptedValue)),
                    },
                  ]}
                />
                <RecordDetailsGrid
                  fields={[
                    { label: "Order value", value: activeOrder ? formatMoneyUGX(activeOrder.value) : null },
                    {
                      label: "Accepted goods value",
                      value: invoiceMatch.acceptedValue === null ? null : formatMoneyUGX(invoiceMatch.acceptedValue),
                    },
                    { label: "Previously invoiced", value: formatMoneyUGX(invoiceMatch.previouslyInvoiced) },
                    { label: "This invoice", value: formatMoneyUGX(invoiceMatch.amount) },
                    ...(goodsEvidence?.notes.length
                      ? [{ label: "Delivery notes", value: goodsEvidence.notes.join(", "), wide: true }]
                      : []),
                    ...(goodsEvidence?.certifiedAt
                      ? [
                          {
                            label: "Goods accepted by",
                            value: `${goodsEvidence.certifiedBy || "—"} · ${formatPrintDate(goodsEvidence.certifiedAt)}`,
                            wide: true,
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            ) : null}
            <Box sx={{ mt: 1.5, "&:empty": { display: "none" } }}>
              <OrgAwardDecisionTrail timeline={row.timeline} stage="invoice" />
            </Box>
            {invoiceAction || canRejectInvoice ? (
              <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {canRejectInvoice ? (
                  <ProcessGateTooltip inactive={invoiceOff} title={invoiceOffTitle} className="w-full sm:w-auto">
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<BlockRounded />}
                      disabled={busy || invoiceOff}
                      onClick={() => {
                        setInvoiceRejectError("");
                        setInvoiceToReject(openInvoice);
                      }}
                      className="w-full sm:w-auto"
                    >
                      Reject
                    </Button>
                  </ProcessGateTooltip>
                ) : null}
                {invoiceAction ? (
                  <ProcessGateTooltip inactive={invoiceOff} title={invoiceOffTitle} className="w-full sm:w-auto">
                    <Button
                      variant="contained"
                      startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <ReceiptLongRounded />}
                      disabled={busy || invoiceOff}
                      onClick={() => void confirmThen(invoiceAction.label, invoiceAction.run)}
                      className="w-full sm:w-auto"
                    >
                      {invoiceAction.label}
                    </Button>
                  </ProcessGateTooltip>
                ) : null}
              </div>
            ) : (
              <Typography variant="body2" sx={{ ...adminMutedTextSx, mt: 1 }}>
                Awaiting processing.
              </Typography>
            )}
          </>
        ) : latestInvoice && latestInvoice.status !== "REJECTED" ? null : (
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mt: 1 }}>
            {`Waiting for ${orderProvider} to send an invoice.`}
          </Typography>
        )}

        {processedInvoices.length ? (
          <div className="mt-3">
            <OrgLineItemsTable
              title="Invoices"
              rows={processedInvoices}
              columns={[
                { id: "invoiceNumber", label: "Invoice no." },
                {
                  id: "date",
                  label: "Date",
                  render: (i) => formatPrintDate(i.invoiceDate || i.createdAt),
                },
                { id: "amount", label: "Amount", align: "right", render: (i) => formatMoneyUGX(i.amount) },
                {
                  id: "status",
                  label: "Status",
                  render: (i) => (
                    <Chip
                      size="small"
                      variant="outlined"
                      color={i.status === "REJECTED" ? "error" : i.status === "RECEIVED" ? "info" : "success"}
                      label={i.status.charAt(0) + i.status.slice(1).toLowerCase().replace(/_/g, " ")}
                    />
                  ),
                },
                { id: "rejectionReason", label: "Reason", render: (i) => i.rejectionReason || "—" },
              ]}
            />
          </div>
        ) : null}
      </Paper>
      </ProcurementSectionGate>
      ) : null}

      {on("payment") ? (
      <ProcurementSectionGate access={sections?.payment}>
      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Payment
          </Typography>
          {currentPayment?.status === "PAID" ? (
            <Chip size="small" color="success" label="Paid" />
          ) : currentPayment?.status === "APPROVED" ? (
            <Chip size="small" color="info" label="Approved" />
          ) : payableInvoice ? (
            <Chip size="small" color="warning" variant="outlined" label="Awaiting approval" />
          ) : (
            <Chip size="small" color="warning" variant="outlined" label="Awaiting invoice" />
          )}
        </div>

        {payableInvoice ? (
          <>
            <RecordDetailsGrid
              fields={[
                { label: "Invoice no.", value: payableInvoice.invoiceNumber },
                {
                  label: providerWord.charAt(0).toUpperCase() + providerWord.slice(1),
                  value: payableInvoice.supplier?.name || activeOrder?.supplierName || null,
                },
                {
                  label: "Invoice date",
                  value: formatPrintDate(payableInvoice.invoiceDate || payableInvoice.createdAt),
                },
                { label: "Invoice amount", value: formatMoneyUGX(payableInvoice.amount) },
                {
                  label: "Order",
                  value: activeOrder ? `${activeOrder.kind} ${activeOrder.number}` : null,
                },
                ...(invoiceVerified
                  ? [
                      {
                        label: "Invoice verified",
                        value: `${invoiceVerified.by || "—"} · ${formatPrintDate(invoiceVerified.at)}`,
                        wide: true,
                      },
                    ]
                  : []),
                ...(paymentMatch
                  ? [
                      {
                        label: "Three-way match",
                        value: (
                          <Chip size="small" color={paymentMatch.result.color} label={paymentMatch.result.label} />
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 2 }}>
              Payment
            </Typography>
            <RecordDetailsGrid
              fields={[
                { label: "Order value", value: activeOrder ? formatMoneyUGX(activeOrder.value) : null },
                {
                  label: "Accepted goods value",
                  value: paymentMatch?.acceptedValue == null ? null : formatMoneyUGX(paymentMatch.acceptedValue),
                },
                { label: "Previously paid", value: formatMoneyUGX(previouslyPaid) },
                { label: "This payment", value: formatMoneyUGX(thisPaymentAmount) },
                ...(activeOrder
                  ? [
                      {
                        label: "Balance on order",
                        value: formatMoneyUGX(Math.max(0, activeOrder.value - previouslyPaid - thisPaymentAmount)),
                      },
                    ]
                  : []),
                ...(currentPayment?.approvedBy?.displayName
                  ? [{ label: "Approved by", value: currentPayment.approvedBy.displayName }]
                  : []),
                ...(currentPayment?.paymentReference
                  ? [{ label: "Payment reference", value: currentPayment.paymentReference }]
                  : []),
                ...(currentPayment?.status === "PAID" && currentPayment.paymentDate
                  ? [{ label: "Paid on", value: formatPrintDate(currentPayment.paymentDate) }]
                  : []),
              ]}
            />
            <Box sx={{ mt: 1.5, "&:empty": { display: "none" } }}>
              <OrgAwardDecisionTrail timeline={row.timeline} stage="payment" />
            </Box>
            {paymentAction?.kind === "record" ? (
              <TextField
                label="Payment reference"
                value={paymentRef}
                onChange={(e) => {
                  setPaymentRef(e.target.value);
                  setPaymentRefError("");
                }}
                error={Boolean(paymentRefError)}
                helperText={paymentRefError || "Auto-generated, editable"}
                fullWidth
                sx={{ ...themedTextFieldSx, mt: 2 }}
              />
            ) : null}
            {paymentAction || paymentSecondary ? (
              <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {paymentSecondary ? (
                  <ProcessGateTooltip inactive={paymentOff} title={paymentOffTitle} className="w-full sm:w-auto">
                    <Button
                      variant="outlined"
                      color={paymentSecondary === "return" ? "warning" : "error"}
                      startIcon={paymentSecondary === "return" ? <UndoRounded /> : <BlockRounded />}
                      disabled={busy || paymentOff}
                      onClick={() => {
                        setPaymentReasonError("");
                        setPaymentReasonOpen(true);
                      }}
                      className="w-full sm:w-auto"
                    >
                      {paymentSecondary === "return" ? "Return" : "Reject"}
                    </Button>
                  </ProcessGateTooltip>
                ) : null}
                {paymentAction ? (
                  <ProcessGateTooltip inactive={paymentOff} title={paymentOffTitle} className="w-full sm:w-auto">
                    <Button
                      variant="contained"
                      color={paymentAction.kind === "record" ? "success" : "primary"}
                      startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <PaymentsRounded />}
                      disabled={busy || paymentOff}
                      onClick={() => void runPaymentAction()}
                      className="w-full sm:w-auto"
                    >
                      {paymentAction.label}
                    </Button>
                  </ProcessGateTooltip>
                ) : null}
              </div>
            ) : currentPayment?.status === "PAID" ? null : (
              <Typography variant="body2" sx={{ ...adminMutedTextSx, mt: 1 }}>
                {currentPayment?.status === "APPROVED" ? "Awaiting payment." : "Awaiting approval."}
              </Typography>
            )}
          </>
        ) : (
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mt: 1 }}>
            Waiting for a verified invoice.
          </Typography>
        )}

        {paymentsNewestFirst.some((p) => p.id !== currentPayment?.id) ? (
          <div className="mt-3">
            <OrgLineItemsTable
              title="Payments"
              rows={paymentsNewestFirst.filter((p) => p.id !== currentPayment?.id)}
              columns={[
                { id: "date", label: "Date", render: (p) => formatPrintDate(p.createdAt) },
                { id: "amount", label: "Amount", align: "right", render: (p) => formatMoneyUGX(p.amount) },
                {
                  id: "status",
                  label: "Status",
                  render: (p) => (
                    <Chip
                      size="small"
                      variant="outlined"
                      color={p.status === "PAID" ? "success" : p.status === "REJECTED" ? "error" : "info"}
                      label={p.status.charAt(0) + p.status.slice(1).toLowerCase()}
                    />
                  ),
                },
                { id: "ref", label: "Reference", render: (p) => p.paymentReference || "—" },
              ]}
            />
          </div>
        ) : null}
      </Paper>
      </ProcurementSectionGate>
      ) : null}

      {on("closure") ? (
      <ProcurementSectionGate access={sections?.closure}>
      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Closure
          </Typography>
          {row.status === "CLOSED" ? (
            <Chip size="small" color="success" label="Closed" />
          ) : closureBlockers.length ? (
            <Chip size="small" color="warning" variant="outlined" label="Not ready" />
          ) : (
            <Chip size="small" color="info" label="Ready to close" />
          )}
        </div>
        <RecordDetailsGrid
          fields={[
            {
              label: providerWord.charAt(0).toUpperCase() + providerWord.slice(1),
              value: activeOrder?.supplierName || null,
            },
            { label: "Order", value: activeOrder ? `${activeOrder.kind} ${activeOrder.number}` : null },
            { label: "Order value", value: activeOrder ? formatMoneyUGX(activeOrder.value) : null },
            {
              label: "Accepted goods value",
              value: moneySummary.acceptedValue === null ? null : formatMoneyUGX(moneySummary.acceptedValue),
            },
            { label: "Invoiced", value: formatMoneyUGX(invoicedTotal) },
            { label: "Paid", value: formatMoneyUGX(paidTotal) },
            ...(moneySummary.unpaidOnOrder !== null && moneySummary.unpaidOnOrder > 0.009
              ? [{ label: "Unpaid on order", value: formatMoneyUGX(moneySummary.unpaidOnOrder) }]
              : []),
          ]}
        />
        <div className="mt-3">
          <OrgLineItemsTable
            rows={closureChecklist}
            columns={[
              { id: "stage", label: "Stage" },
              { id: "details", label: "Details" },
              {
                id: "done",
                label: "Status",
                render: (c) => (
                  <Chip
                    size="small"
                    variant="outlined"
                    color={c.done ? "success" : "warning"}
                    label={c.done ? "Complete" : "Pending"}
                  />
                ),
              },
            ]}
          />
        </div>
        {row.status === "CLOSED" ? (
          <RecordDetailsGrid
            fields={[
              { label: "Closed on", value: row.closedAt ? formatPrintDate(row.closedAt) : null },
              { label: "Closed by", value: row.closedBy?.displayName || null },
              ...(row.closureRemarks ? [{ label: "Remarks", value: row.closureRemarks, full: true }] : []),
            ]}
          />
        ) : (
          <>
            {closureBlockers.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-brand-red">
                {closureBlockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
            {canClose ? (
              <div className="mt-3 flex justify-end">
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<TaskAltRounded />}
                  disabled={busy || closureBlockers.length > 0}
                  onClick={() => setCloseConfirmOpen(true)}
                  className="w-full sm:w-auto"
                >
                  Close procurement
                </Button>
              </div>
            ) : !closureBlockers.length ? (
              <Typography variant="body2" sx={{ ...adminMutedTextSx, mt: 1 }}>
                Awaiting closure.
              </Typography>
            ) : null}
          </>
        )}
      </Paper>
      </ProcurementSectionGate>
      ) : null}

      {canViewStage ? (
      <WorkflowHistoryPanel
        showStatusChange
        history={(row.timeline || []).map((a) => ({
          id: a.id,
          createdAt: a.createdAt,
          decision: a.decision,
          actionLabel: a.actionText || null,
          actorName: a.actor?.displayName || null,
          actorRoleName: a.actorRoleName || null,
          committeeId: a.committeeId || null,
          committeeRole: a.committeeRole || null,
          committeeName: a.committeeName || null,
          stepRoleName: a.stepRoleName || null,
          previousStatus: a.previousStatus,
          newStatus: a.newStatus,
          statusLabel: a.statusTransition?.label || null,
          comment: a.comment,
          notes: [
            a.departmentName ? `Department: ${a.departmentName}` : null,
            a.committeeRole ? `Committee role: ${String(a.committeeRole).replace(/_/g, " ")}` : null,
            a.amountLabel ? `Amount: ${a.amountLabel}` : null,
            a.processName ? `Process: ${a.processName}` : null,
          ],
        }))}
      />
      ) : null}
      <Dialog
        open={piWarnOpen}
        onClose={() => (busy ? null : setPiWarnOpen(false))}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
        aria-labelledby="pi-provider-warning-title"
      >
        <DialogTitle id="pi-provider-warning-title" className="flex items-center gap-2">
          <WarningAmberRounded color="warning" aria-hidden />
          {providerWord.charAt(0).toUpperCase() + providerWord.slice(1)} no longer meets requirements
        </DialogTitle>
        <DialogContent dividers>
          <ul className="space-y-2">
            {piProviderFailures.map((p) => (
              <li key={p.id} className="text-sm">
                <span className="font-semibold">{p.name}</span>
                {p.reasons.length ? (
                  <span className="block text-xs text-brand-red wrap-break-word">{p.reasons.join(" · ")}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <Typography variant="body2" sx={{ mt: 2, fontWeight: 600 }}>
            Do you still want to proceed and issue the purchase instruction?
          </Typography>
        </DialogContent>
        <DialogActions className="flex-wrap gap-2">
          <Button onClick={() => setPiWarnOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
            onClick={async () => {
              await submitDecision({ acknowledged: true });
              setPiWarnOpen(false);
            }}
          >
            {busy ? "Issuing purchase instruction…" : "Issue anyway"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(invoiceToReject)}
        onClose={() => (busy ? null : setInvoiceToReject(null))}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
        aria-labelledby="invoice-reject-title"
      >
        <DialogTitle id="invoice-reject-title">
          Reject invoice {invoiceToReject?.invoiceNumber || ""}
        </DialogTitle>
        <DialogContent dividers>
          <form
            noValidate
            id="invoice-reject-form"
            onSubmit={(e) => {
              e.preventDefault();
              void confirmRejectInvoice();
            }}
          >
            <TextField
              label="Reason"
              value={invoiceRejectReason}
              onChange={(e) => {
                setInvoiceRejectReason(e.target.value);
                setInvoiceRejectError("");
              }}
              error={Boolean(invoiceRejectError)}
              helperText={invoiceRejectError || undefined}
              fullWidth
              multiline
              minRows={2}
              autoFocus
              sx={themedTextFieldSx}
            />
          </form>
        </DialogContent>
        <DialogActions className="flex-wrap gap-2">
          <Button onClick={() => setInvoiceToReject(null)} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="invoice-reject-form"
            variant="contained"
            color="error"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <BlockRounded />}
          >
            {busy ? "Rejecting…" : "Reject invoice"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={closeConfirmOpen && row.status !== "CLOSED"}
        onClose={() => (busy ? null : setCloseConfirmOpen(false))}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
        aria-labelledby="close-procurement-title"
      >
        <DialogTitle id="close-procurement-title">Close {row.procurementNumber}?</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
            This is final.
          </Typography>
          <TextField
            label="Closure remarks"
            value={closureRemarks}
            onChange={(e) => setClosureRemarks(e.target.value)}
            helperText="Optional"
            autoFocus
            fullWidth
            multiline
            minRows={2}
            sx={themedTextFieldSx}
          />
        </DialogContent>
        <DialogActions className="flex-wrap gap-2">
          <Button onClick={() => setCloseConfirmOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            disabled={busy}
            onClick={() => void confirmClose()}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <TaskAltRounded />}
          >
            {busy ? "Closing…" : "Confirm closure"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={paymentReasonOpen}
        onClose={() => (busy ? null : setPaymentReasonOpen(false))}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
        aria-labelledby="payment-reason-title"
      >
        <DialogTitle id="payment-reason-title">
          {paymentSecondary === "return" ? "Return payment" : "Reject payment"}
        </DialogTitle>
        <DialogContent dividers>
          <form
            noValidate
            id="payment-reason-form"
            onSubmit={(e) => {
              e.preventDefault();
              void confirmPaymentSecondary();
            }}
          >
            <TextField
              label="Reason"
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                setPaymentReasonError("");
              }}
              error={Boolean(paymentReasonError)}
              helperText={paymentReasonError || undefined}
              fullWidth
              multiline
              minRows={2}
              autoFocus
              sx={themedTextFieldSx}
            />
          </form>
        </DialogContent>
        <DialogActions className="flex-wrap gap-2">
          <Button onClick={() => setPaymentReasonOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="payment-reason-form"
            variant="contained"
            color={paymentSecondary === "return" ? "warning" : "error"}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {paymentSecondary === "return" ? "Return" : "Reject payment"}
          </Button>
        </DialogActions>
      </Dialog>
      {recommendOpen && recommendation?.canRecommend ? (
        <OrgRecommendationDialog
          open
          onClose={() => setRecommendOpen(false)}
          projectId={projectId}
          procurementId={procurementId}
          kinds={recommendation.kinds || []}
          currentProviderId={recommendation.currentProviderId}
          currentProviderName={row.requisition?.shortlist?.[0]?.name || null}
          currentShortlist={recommendation.currentShortlist || []}
          providers={suppliers}
          onSubmitted={async () => {
            notifyOrgTasksChanged(projectId);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}
