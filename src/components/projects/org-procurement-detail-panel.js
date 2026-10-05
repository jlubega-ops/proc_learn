"use client";

import { useCallback, useEffect, useState } from "react";
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
import DescriptionRounded from "@mui/icons-material/DescriptionRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { useToast } from "@/components/providers/toast-provider";
import { WorkflowHistoryPanel } from "@/components/projects/workflow-history-panel";
import { notifyOrgTasksChanged } from "@/hooks/use-pending-task-counts";
import { OrgBidDocumentFillDialog } from "@/components/projects/org-bid-document-fill-dialog";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { formatMoneyUGX } from "@/lib/money";
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
  OrgOffersCard,
  SubmissionSourceChip,
} from "@/components/projects/org-procurement-supply-cards";
import { OrgEvaluationPanel } from "@/components/projects/org-evaluation-panel";
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
import { isRecommendationDecisionTask } from "@/lib/projects/procurement-recommendation-options";
import GavelRounded from "@mui/icons-material/GavelRounded";
import {
  DEFAULT_PI_PAYMENT_TERMS,
  validatePurchaseInstructionTerms,
} from "@/lib/validation/purchase-instruction";
import { toDateInputValue } from "@/lib/financial-year-dates";
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
import TaskAltRounded from "@mui/icons-material/TaskAltRounded";

const APPROVE_PAYMENT_STEP_RE = /^approve payment|^payment approval/i;
const RECORD_PAYMENT_STEP_RE = /^record payment|^payment recording/i;
const CLOSE_STEP_RE = /^close procurement|^procurement closure/i;
const INVOICE_STEP_RE =
  /^receive\/record invoice|^receive.?record invoice|^process invoice|^invoice$|^verify invoice|^invoice verification|^certify and verify invoice/i;

const METHOD_LABELS = {
  MICRO: "Micro Procurement",
  QUOTATION: "Quotation",
  TENDER: "Tender",
};

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
      label: row.procurementMethod === "MICRO" ? "Approved provider" : "Shortlisted providers",
      value: approvedProviders || (row.procurementMethod === "TENDER" ? "Open advertisement" : null),
      wide: true,
    },
    { label: "Plan item", value: row.procurementPlanItem?.title, wide: true },
    {
      label: "Budget line",
      value: row.budgetLine ? [row.budgetLine.code, row.budgetLine.name].filter(Boolean).join(" — ") : null,
      wide: true,
    },
    { label: "Estimated value", value: formatMoneyUGX(req?.estimatedTotalValue) },
    { label: "Order / contract no.", value: activeOrder?.number },
    { label: "Order value", value: activeOrder ? formatMoneyUGX(activeOrder.value) : null },
    { label: "Provider on order", value: activeOrder?.supplierName },
    {
      label: "Delivery location",
      value: activeOrder?.deliveryAddress || req?.deliveryLocation,
      wide: true,
    },
    { label: "Procurement officer", value: row.officer?.displayName, wide: true },
    { label: "Created on", value: dateOrNull(row.createdAt) },
    { label: "Closed on", value: dateOrNull(row.closedAt) },
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
  const [comment, setComment] = useState("");
  const [suppliers, setSuppliers] = useState(/** @type {any[]} */ ([]));
  const [piSupplierIds, setPiSupplierIds] = useState(/** @type {string[]} */ ([]));
  const [inviteIds, setInviteIds] = useState(/** @type {string[]} */ ([]));
  const [selectionError, setSelectionError] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [offerSupplierId, setOfferSupplierId] = useState("");
  const [offerAmount, setOfferAmount] = useState("");
  /** @type {[Record<string, string>, Function]} */
  const [offerErrors, setOfferErrors] = useState({});
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
  const [inspectionNotes, setInspectionNotes] = useState("");
  /** @type {[Record<string, { accepted: string; rejected: string }>, Function]} */
  const [inspectionLineEdits, setInspectionLineEdits] = useState({});
  const [inspectionCommitteeId, setInspectionCommitteeId] = useState("");
  /** @type {[Record<string, string>, Function]} */
  const [receiveErrors, setReceiveErrors] = useState({});
  /** @type {[Record<string, string>, Function]} */
  const [inspectionErrors, setInspectionErrors] = useState({});
  const [committees, setCommittees] = useState(/** @type {any[]} */ ([]));
  const [rejectReason, setRejectReason] = useState("");
  const [cancelAwardReason, setCancelAwardReason] = useState("");
  const [bidDialogOpen, setBidDialogOpen] = useState(false);
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
      const shortlistIds = (data.procurement?.requisition?.shortlist || [])
        .map((s) => s?.id)
        .filter(Boolean);
      setPiSupplierIds(shortlistIds.slice(0, 1));
      setInviteIds(shortlistIds);
      setSelectionError("");
      setClosingDate("");
      setOfferSupplierId("");
      setOfferAmount("");
      setOfferErrors({});
      setDeliveryQtys({});
      setInspectionNotes("");
      setInspectionLineEdits({});
      setInspectionCommitteeId("");
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

  const loadCommittees = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/org-committees`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setCommittees(Array.isArray(data.committees) ? data.committees : []);
    } catch {
      // optional when VIEW_COMMITTEES is unavailable
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    void loadSuppliers();
    void loadCommittees();
  }, [load, loadSuppliers, loadCommittees]);

  const actionKey = String(pendingTask?.actionKey || "").toUpperCase();
  const taskTitle = String(pendingTask?.title || "");
  const isIssuePi = /issue purchase instruction/i.test(taskTitle);
  const isRfqIssue = /issue rfqs to suppliers/i.test(taskTitle);
  const isTenderAdvertise = /advertise tender/i.test(taskTitle);
  const isReceive = /receive quotations/i.test(taskTitle) || /receive bids/i.test(taskTitle);
  const taskStep = taskTitle.split(":")[0].trim();
  const isInvoiceTask = Boolean(pendingTask) && INVOICE_STEP_RE.test(taskStep);
  const isApprovePaymentTask = Boolean(pendingTask) && APPROVE_PAYMENT_STEP_RE.test(taskStep);
  const isRecordPaymentTask = Boolean(pendingTask) && RECORD_PAYMENT_STEP_RE.test(taskStep);
  const isCloseTask = Boolean(pendingTask) && CLOSE_STEP_RE.test(taskStep);
  const isApproveEvaluationTask =
    /^approve evaluation report|approve evaluation\/recommendation/i.test(taskTitle);
  const isReceiveGoodsTask = Boolean(pendingTask) && isReceiveGoodsStep(taskTitle);
  const isAcceptGoodsTask = Boolean(pendingTask) && isAcceptGoodsStep(taskTitle);
  const isPositiveDecision = isPositiveWorkflowDecision(decision);
  const stepActionLabel = workflowStepActionLabel(taskTitle);
  const usesProviderPicker = (isIssuePi || isRfqIssue) && isPositiveDecision;
  const reqCategory = row?.requisition?.category || null;
  const approvedShortlistCount = (row?.requisition?.shortlist || []).length;
  const piApprovedProvider = isIssuePi && isPositiveDecision && approvedShortlistCount > 0;
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
  const printPi = Boolean(piDoc) && on("contract") && row?.procurementMethod === "MICRO" && canViewStage;
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
      showToast({
        message: data.autoInvoice
          ? `${successMessage} The ${providerWord} has sent invoice ${data.autoInvoice.invoiceNumber}.`
          : successMessage,
        severity: "success",
      });
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
      notifyOrgTasksChanged();
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
    setReceiveErrors(errs);
    if (Object.keys(errs).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    const body = {
      lines,
      deliveryNoteId: pendingDeliveryNote.id,
      remarks: `Received against ${pendingDeliveryNote.noteNumber}.`,
    };
    const ok = isReceiveGoodsTask
      ? await submitDeliveryTask(body, "Goods received.")
      : await runLifecycle("record_delivery", body, "Goods received.");
    if (ok) setDeliveryQtys({});
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
      else if (accepted + rejected > Number(l.receivedQuantity) + 0.009) {
        errs[`${l.id}:accepted`] = `Max ${l.receivedQuantity} in total.`;
      }
      return { lineId: l.id, acceptedQuantity: acceptedRaw, rejectedQuantity: rejectedRaw };
    });
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
      committeeId: inspectionCommitteeId || null,
      committeeRole: inspectionCommitteeId ? "INSPECTION" : null,
    };
    const ok = isAcceptGoodsTask
      ? await submitDeliveryTask(body, "Inspection confirmed.")
      : await runLifecycle("record_inspection", body, "Inspection confirmed.");
    if (ok) {
      setInspectionErrors({});
      setInspectionLineEdits({});
      setInspectionNotes("");
    }
  }

  async function recordOfferOnly() {
    if (!pendingTask?.id) return;
    /** @type {Record<string, string>} */
    const next = {};
    if (!offerSupplierId) next.offerSupplierId = `Choose the ${providerWord}.`;
    const amountNum = Number(String(offerAmount).replace(/,/g, "").trim());
    if (!offerAmount.trim() || !Number.isFinite(amountNum) || amountNum <= 0) {
      next.offerAmount = "Enter an amount greater than zero.";
    }
    setOfferErrors(next);
    if (Object.keys(next).length) {
      showToast({
        message: "Please fix the highlighted fields.",
        severity: "error",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: pendingTask.id,
          decision,
          comment,
          offer: { supplierId: offerSupplierId, amount: offerAmount.trim() },
          finalize: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not record the offer.",
          severity: "error",
        });
        return;
      }
      showToast({
        message: "Offer recorded. Record more or complete the step.",
        severity: "success",
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  /** @param {{ acknowledged?: boolean }} [opts] */
  async function submitDecision(opts = {}) {
    if (!pendingTask?.id) return;
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
    setBusy(true);
    try {
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
      if (isReceive && isPositiveDecision && offerSupplierId && offerAmount.trim()) {
        payload.offer = {
          supplierId: offerSupplierId,
          amount: offerAmount.trim(),
        };
        payload.finalize = true;
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
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not record decision.",
          severity: "error",
        });
        return;
      }
      const autoCount = Array.isArray(data.autoResponses?.responded)
        ? data.autoResponses.responded.length
        : 0;
      const baseMessage =
        isIssuePi && isPositiveDecision
          ? "Purchase instruction issued."
          : isRfqIssue && isPositiveDecision
            ? "Requests for quotations issued."
            : isTenderAdvertise && isPositiveDecision
              ? "Tender advertised."
              : "Decision recorded.";
      showToast({
        message: autoCount
          ? `${baseMessage} ${autoCount} auto-response ${autoCount === 1 ? providerWord : providerWordPlural} responded.`
          : baseMessage,
        severity: "success",
      });
      notifyOrgTasksChanged();
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
  const offerProviderOptions =
    row.procurementMethod === "QUOTATION"
      ? (latestSolicitation?.invites || []).map((i) => i.supplier).filter(Boolean)
      : suppliers;
  const respondedIds = new Set(
    offers.filter((o) => o.status !== "WITHDRAWN").map((o) => o.supplierId),
  );
  const requisitionAddress = row.requisition?.deliveryLocation || null;

  /** @type {{ number: string; value: number; supplierName: string | null; deliveryAddress: string | null } | null} */
  let activeOrder = null;
  if (row.contract && ["ACTIVE", "ISSUED", "SIGNED"].includes(row.contract.status)) {
    activeOrder = {
      number: row.contract.contractNumber,
      value: Number(row.contract.contractValue) || 0,
      supplierName: row.contract.supplier?.name || null,
      deliveryAddress: row.contract.deliveryAddress || requisitionAddress,
    };
  } else if (row.lpo && ["ACCEPTED", "ISSUED"].includes(row.lpo.status)) {
    activeOrder = {
      number: row.lpo.lpoNumber,
      value: Number(row.lpo.lpoValue) || 0,
      supplierName: row.lpo.supplier?.name || null,
      deliveryAddress: row.lpo.deliveryAddress || requisitionAddress,
    };
  } else if (pi && ["ISSUED", "ACCEPTED"].includes(pi.status)) {
    activeOrder = {
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
    ? ["ACTIVE", "ISSUED"].includes(row.contract.status)
      ? null
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
  const generatedPaymentRef = `PAY-${row.procurementNumber || "PROC"}-${String(
    paymentsNewestFirst.filter((p) => p.paymentReference).length + 1,
  ).padStart(3, "0")}`;
  const paymentRef = paymentRefInput ?? generatedPaymentRef;
  const paymentAct =
    Boolean(sections?.payment?.act) &&
    !APPROVE_PAYMENT_STEP_RE.test(flowStepLabel) &&
    !RECORD_PAYMENT_STEP_RE.test(flowStepLabel);
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
  const invoicedTotal = verifiedInvoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const paidPayments = paymentsNewestFirst.filter((p) => p.status === "PAID");
  const paidTotal = paidPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
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
      details: deliveries.length ? `${acceptedInspections} of ${deliveries.length} accepted` : "—",
      done: allInspected && acceptedInspections > 0,
    },
    {
      id: "invoice",
      stage: "Invoice",
      details: verifiedInvoices.length
        ? verifiedInvoices.map((i) => `${i.invoiceNumber} · ${formatMoneyUGX(i.amount)}`).join(", ")
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
      helperText={
        approvedShortlistCount > 0
          ? isIssuePi
            ? "Approved by Contracts Committee"
            : "Prefilled from Form 5 Part II."
          : undefined
      }
      actionLabel={isIssuePi ? "Issue purchase instruction" : `Issue RFQs to ${providerWordPlural}`}
      busy={busy}
      busyLabel={isIssuePi ? "Issuing purchase instruction…" : "Issuing RFQs…"}
      extraWarnings={
        isRfqIssue && inviteIds.length > 0 && inviteIds.length < 3
          ? [`Only ${inviteIds.length} invited — RFQ normally invites at least three.`]
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
            {row.procurementMethod ? (
              <Chip
                size="small"
                color="info"
                variant="outlined"
                label={METHOD_LABELS[row.procurementMethod] || row.procurementMethod}
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
            notifyOrgTasksChanged();
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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {pendingTask.title.split(":")[0]}
            </Typography>
            {recommendation?.canRecommend ? (
              <Tooltip title="Recommend cancellation or a provider change to the Contracts Committee">
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<GavelRounded />}
                  onClick={() => setRecommendOpen(true)}
                  disabled={busy}
                  className="w-full sm:w-auto"
                >
                  Recommend to Contracts Committee
                </Button>
              </Tooltip>
            ) : null}
          </div>
          {piApprovedProvider ? <div className="mb-3">{providerPicker}</div> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              select
              label="Decision"
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              fullWidth
              sx={themedTextFieldSx}
            >
              {workflowDecisionOptions(actionKey, {
                isProcurementStep: true,
                includeReturnReject: !recommendation?.allowed,
              }).map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {workflowDecisionLabelForTask(opt, taskTitle)}
                </MenuItem>
              ))}
            </TextField>

            {isTenderAdvertise ? (
              <Alert severity="info" variant="outlined" className="sm:col-span-2">
                Open tender — the bid notice is advertised publicly, so no {providerWordPlural} are
                picked here. Bidders are checked by the Evaluation Committee at eligibility.
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

            {isRfqIssue || isTenderAdvertise ? (
              <>
                <TextField
                  label="Closing date"
                  type="datetime-local"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={themedTextFieldSx}
                />
              </>
            ) : null}

            {isReceive ? (
              <>
                <Alert severity="info" variant="outlined" className="sm:col-span-2">
                  {offers.filter((o) => o.status !== "WITHDRAWN").length} offer(s) received so far
                  (see the list below). Auto-response {providerWordPlural} respond automatically and
                  real ones can submit through their portal login. Record any paper or emailed offer
                  here, then complete the step.
                </Alert>
                <TextField
                  select
                  label={`Offer from ${providerWord}`}
                  value={offerSupplierId}
                  onChange={(e) => {
                    setOfferSupplierId(e.target.value);
                    setOfferErrors((prev) => ({
                      ...prev,
                      offerSupplierId: "",
                    }));
                  }}
                  error={Boolean(offerErrors.offerSupplierId)}
                  helperText={
                    offerErrors.offerSupplierId ||
                    (row.procurementMethod === "QUOTATION"
                      ? `Only ${providerWordPlural} invited to this RFQ`
                      : "Any active registered provider")
                  }
                  fullWidth
                  sx={themedTextFieldSx}
                >
                  <MenuItem value="">—</MenuItem>
                  {offerProviderOptions.map((s) => (
                    <MenuItem key={s.id} value={s.id} disabled={respondedIds.has(s.id)}>
                      {s.name}
                      {respondedIds.has(s.id) ? " (already submitted)" : ""}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Offer amount (UGX)"
                  value={offerAmount}
                  onChange={(e) => {
                    setOfferAmount(e.target.value);
                    setOfferErrors((prev) => ({ ...prev, offerAmount: "" }));
                  }}
                  error={Boolean(offerErrors.offerAmount)}
                  helperText={offerErrors.offerAmount || " "}
                  fullWidth
                  inputProps={{ inputMode: "decimal" }}
                  sx={themedTextFieldSx}
                />
                <div className="sm:col-span-2">
                  <Button
                    variant="outlined"
                    disabled={busy}
                    onClick={() => void recordOfferOnly()}
                    className="w-full sm:w-auto"
                  >
                    Record offer (keep step open)
                  </Button>
                </div>
              </>
            ) : null}

            <TextField
              label="Comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              className="sm:col-span-2"
              sx={themedTextFieldSx}
            />
          </div>
          {usesProviderPicker && !piApprovedProvider ? (
            <div className="mt-3">{providerPicker}</div>
          ) : null}
          {!usesProviderPicker || piApprovedProvider ? (
            <div className="mt-3">
              <Button
                variant="contained"
                color={decision === "REJECT" ? "error" : "primary"}
                disabled={busy}
                onClick={() => void submitDecision()}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
              >
                {busy
                  ? workflowDecisionButtonLabel(decision, { busy })
                  : stepActionLabel && isPositiveDecision
                    ? stepActionLabel
                    : decision === "COMPLETE"
                      ? "Complete & forward"
                      : workflowDecisionButtonLabel(decision, { busy })}
              </Button>
            </div>
          ) : null}
        </Paper>
      ) : null}

      {piDoc && (overview || on("contract")) ? <PurchaseInstructionView doc={piDoc} /> : null}

      {on("sourcing") ? (
      <ProcurementSectionGate access={sections?.sourcing}>
      {solicitations.length > 0 ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            Solicitation
          </Typography>
          <ul className="space-y-2 text-sm">
            {solicitations.map((s) => (
              <li key={s.id}>
                <span className="font-semibold">{s.solicitationType}</span> — {s.title} · {s.status}
                {s.closingDate ? ` · closes ${String(s.closingDate).slice(0, 16)}` : ""}
                {(s.invites || []).length ? ` · ${s.invites.length} invited` : ""}
                {s.bidDocumentAt ? ` · bid/RFQ filled ${String(s.bidDocumentAt).slice(0, 10)}` : ""}
              </li>
            ))}
          </ul>
        </Paper>
      ) : null}

      {row.procurementMethod === "QUOTATION" || row.procurementMethod === "TENDER" ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            Bid / RFQ document (teaching)
          </Typography>
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
            Fill the educational bid or request-for-quotations packet in-app. Saving creates a draft
            solicitation if needed. Download a branded PDF from the fill dialog (named from the
            procurement reference).
          </Typography>
          <Button
            variant="contained"
            startIcon={<DescriptionRounded />}
            onClick={() => setBidDialogOpen(true)}
          >
            {solicitations[0]?.bidDocument ? "Edit bid / RFQ document" : "Fill bid / RFQ document"}
          </Button>
        </Paper>
      ) : null}

      <OrgOffersCard offers={offers} providerWord={providerWord} />
      </ProcurementSectionGate>
      ) : null}

      {on("evaluation") &&
      (row.procurementMethod === "QUOTATION" || row.procurementMethod === "TENDER") &&
      (!sections || sections.evaluation?.view) ? (
        <OrgEvaluationPanel
          projectId={projectId}
          procurement={row}
          providerWord={providerWord}
          onChanged={() => void load()}
        />
      ) : null}

      {row.procurementMethod !== "MICRO" ? (
        <>
          {on("award") ? (
          <ProcurementSectionGate access={sections?.award}>
          <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Award
            </Typography>
            {row.award ? (
              <div className="space-y-1 text-sm">
                <p>
                  <span className="font-semibold">{row.award.supplier?.name || "—"}</span> ·{" "}
                  {formatMoneyUGX(row.award.awardedAmount)} · {row.award.status}
                </p>
                {row.award.approvedBy?.displayName ? (
                  <p className="opacity-80">Approved by {row.award.approvedBy.displayName}</p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-2">
                  {row.award.status === "APPROVED" ? (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        void runLifecycle("communicate_award", {
                          awardId: row.award.id,
                        })
                      }
                    >
                      Communicate award
                    </Button>
                  ) : null}
                  {row.award.status === "COMMUNICATED" ? (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        void runLifecycle("accept_award", {
                          awardId: row.award.id,
                        })
                      }
                    >
                      Record supplier acceptance
                    </Button>
                  ) : null}
                  {row.award.status !== "CANCELLED" &&
                  !row.lpo &&
                  !row.contract &&
                  ["APPROVED", "COMMUNICATED", "ACCEPTED"].includes(row.award.status) ? (
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
                          void runLifecycle("cancel_award", {
                            awardId: row.award.id,
                            reason: cancelAwardReason.trim(),
                          })
                        }
                      >
                        Cancel award
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Typography variant="body2" sx={adminMutedTextSx}>
                  No award yet. The Contracts Committee makes the award decision after the evaluation
                  report is approved
                  {row.requiresPostQualification ? " and post-qualification is complete" : ""}.
                </Typography>
                {String(viewerCommitteeType || "").toUpperCase() === "CONTRACTS" ? (
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy || row.status === "CLOSED"}
                    onClick={() => void runLifecycle("create_award")}
                  >
                    Create award from evaluation
                  </Button>
                ) : (
                  <Typography variant="body2" sx={adminMutedTextSx}>
                    Pending Contracts Committee award decision.
                  </Typography>
                )}
              </div>
            )}
          </Paper>
          </ProcurementSectionGate>
          ) : null}

          {on("contract") ? (
          <ProcurementSectionGate access={sections?.contract}>
          <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Contract / LPO
            </Typography>
            {row.lpo ? (
              <div className="space-y-2 text-sm">
                <p>
                  LPO <span className="font-semibold">{row.lpo.lpoNumber}</span> · {row.lpo.status}{" "}
                  · {formatMoneyUGX(row.lpo.lpoValue)}
                  {row.lpo.supplier?.name ? ` · ${row.lpo.supplier.name}` : ""}
                </p>
                <OrgDeliveryAddressLine
                  address={row.lpo.deliveryAddress}
                  fallback={requisitionAddress}
                  editableKind={["DRAFT", "APPROVED"].includes(row.lpo.status) ? "lpo" : null}
                  busy={busy}
                  onSave={saveDeliveryAddress}
                />
                <div className="flex flex-wrap gap-2">
                  {row.lpo.status === "DRAFT" ? (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy}
                      onClick={() => void runLifecycle("approve_lpo", { lpoId: row.lpo.id })}
                    >
                      Approve LPO
                    </Button>
                  ) : null}
                  {row.lpo.status === "APPROVED" ? (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy}
                      onClick={() => void runLifecycle("issue_lpo", { lpoId: row.lpo.id })}
                    >
                      Issue LPO
                    </Button>
                  ) : null}
                  {row.lpo.status === "ISSUED" ? (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy}
                      onClick={() => void runLifecycle("accept_lpo", { lpoId: row.lpo.id })}
                    >
                      Accept LPO
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : row.contract ? (
              <div className="space-y-2 text-sm">
                <p>
                  Contract <span className="font-semibold">{row.contract.contractNumber}</span> ·{" "}
                  {row.contract.status} · {formatMoneyUGX(row.contract.contractValue)}
                  {row.contract.supplier?.name ? ` · ${row.contract.supplier.name}` : ""}
                </p>
                <OrgDeliveryAddressLine
                  address={row.contract.deliveryAddress}
                  fallback={requisitionAddress}
                  editableKind={
                    ["DRAFT", "APPROVED"].includes(row.contract.status) ? "contract" : null
                  }
                  busy={busy}
                  onSave={saveDeliveryAddress}
                />
                <div className="flex flex-wrap gap-2">
                  {row.contract.status === "DRAFT" ? (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        void runLifecycle("approve_contract", {
                          contractId: row.contract.id,
                        })
                      }
                    >
                      Approve contract
                    </Button>
                  ) : null}
                  {row.contract.status === "APPROVED" ? (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        void runLifecycle("sign_contract", {
                          contractId: row.contract.id,
                        })
                      }
                    >
                      Sign contract
                    </Button>
                  ) : null}
                  {row.contract.status === "SIGNED" ? (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        void runLifecycle("issue_contract", {
                          contractId: row.contract.id,
                        })
                      }
                    >
                      Issue contract
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {row.procurementMethod === "QUOTATION" ? (
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy || !row.award || row.award.status !== "ACCEPTED"}
                    onClick={() => void runLifecycle("create_lpo")}
                    title={
                      row.award?.status === "ACCEPTED"
                        ? "Create LPO"
                        : "Accept the award before creating an LPO"
                    }
                  >
                    Create LPO
                  </Button>
                ) : null}
                {row.procurementMethod === "TENDER" ? (
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy || !row.award || row.award.status !== "ACCEPTED"}
                    onClick={() => void runLifecycle("create_contract")}
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
                      render: (l) => `${l.quantity}${l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ""}`,
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
                                value={deliveryQtys[l.itemName] ?? l.quantity}
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
                <div className="mt-3 flex justify-end">
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
                    received: `${l.receivedQuantity}${l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ""}`,
                    ordered: l.orderedQuantity,
                    by: d.recordedBy?.displayName || "—",
                  })),
                )}
                columns={[
                  { id: "date", label: "Date" },
                  { id: "note", label: "Delivery note" },
                  { id: "item", label: "Item" },
                  { id: "received", label: "Received", align: "right" },
                  { id: "ordered", label: "Ordered", align: "right" },
                  { id: "by", label: "Received by" },
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
                onClick={() => void submitDeliveryTask({}, "Goods received.")}
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
                            render: (l) => `${l.receivedQuantity}${l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ""}`,
                          },
                          ...["accepted", "rejected"].map((field) => ({
                            id: field,
                            label: field === "accepted" ? "Accepted" : "Rejected",
                            align: /** @type {"right"} */ ("right"),
                            render: (/** @type {any} */ l) => {
                              const edit = inspectionLineEdits[l.id] || {
                                accepted: String(l.receivedQuantity ?? ""),
                                rejected: "0",
                              };
                              return (
                                <TextField
                                  aria-label={`${field === "accepted" ? "Accepted" : "Rejected"} quantity for ${l.itemName}`}
                                  value={edit[field]}
                                  onChange={(e) => {
                                    setInspectionLineEdits((prev) => ({
                                      ...prev,
                                      [l.id]: { ...edit, [field]: e.target.value },
                                    }));
                                    setInspectionErrors((prev) => ({ ...prev, [`${l.id}:${field}`]: "" }));
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
                      <div className="grid gap-3 sm:grid-cols-2">
                        {row.procurementMethod !== "MICRO" ? (
                          <TextField
                            select
                            label="Inspection committee"
                            value={inspectionCommitteeId}
                            onChange={(e) => setInspectionCommitteeId(e.target.value)}
                            fullWidth
                            helperText="Optional"
                            sx={themedTextFieldSx}
                          >
                            <MenuItem value="">None</MenuItem>
                            {committees
                              .filter((c) => c.isActive && c.committeeType === "INSPECTION_ACCEPTANCE")
                              .map((c) => (
                                <MenuItem key={c.id} value={c.id}>
                                  {c.name}
                                </MenuItem>
                              ))}
                          </TextField>
                        ) : null}
                        <TextField
                          label="Notes"
                          value={inspectionNotes}
                          onChange={(e) => setInspectionNotes(e.target.value)}
                          fullWidth
                          helperText="Optional"
                          sx={themedTextFieldSx}
                          className={row.procurementMethod === "MICRO" ? "sm:col-span-2" : undefined}
                        />
                      </div>
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
                        received: l.receivedQuantity,
                        accepted: l.acceptedQuantity,
                        rejected: l.rejectedQuantity,
                        status: d.inspection.status,
                        by: d.inspection.inspectedBy?.displayName || "—",
                      })),
                    )}
                  columns={[
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
              </div>
            ) : null}

            {isAcceptGoodsTask && allInspected ? (
              <div className="mt-3 flex justify-end">
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleRounded />}
                  disabled={busy}
                  onClick={() => void submitDeliveryTask({}, "Delivery accepted.")}
                  className="w-full sm:w-auto"
                >
                  Accept delivery
                </Button>
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
                {
                  label: "Order value",
                  value: activeOrder ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {formatMoneyUGX(activeOrder.value)}
                      {Math.abs((Number(openInvoice.amount) || 0) - activeOrder.value) > 0.009 ? (
                        <Chip size="small" color="warning" variant="outlined" label="Differs" />
                      ) : null}
                    </span>
                  ) : null,
                },
                { label: "Order", value: activeOrder?.number || null },
                { label: "Source", value: <SubmissionSourceChip source={openInvoice.source} /> },
                ...(openInvoice.deliveryAddress
                  ? [{ label: "Delivered to", value: openInvoice.deliveryAddress, full: true }]
                  : []),
                ...(openInvoice.notes ? [{ label: "Notes", value: openInvoice.notes, full: true }] : []),
              ]}
            />
            {invoiceAction || canRejectInvoice ? (
              <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {canRejectInvoice ? (
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<BlockRounded />}
                    disabled={busy}
                    onClick={() => {
                      setInvoiceRejectError("");
                      setInvoiceToReject(openInvoice);
                    }}
                    className="w-full sm:w-auto"
                  >
                    Reject
                  </Button>
                ) : null}
                {invoiceAction ? (
                  <Button
                    variant="contained"
                    startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <ReceiptLongRounded />}
                    disabled={busy}
                    onClick={() => void invoiceAction.run()}
                    className="w-full sm:w-auto"
                  >
                    {invoiceAction.label}
                  </Button>
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
                { label: "Invoice amount", value: formatMoneyUGX(payableInvoice.amount) },
                {
                  label: "Payment amount",
                  value: formatMoneyUGX(currentPayment?.amount ?? payableInvoice.amount),
                },
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
                  <Button
                    variant="outlined"
                    color={paymentSecondary === "return" ? "warning" : "error"}
                    startIcon={paymentSecondary === "return" ? <UndoRounded /> : <BlockRounded />}
                    disabled={busy}
                    onClick={() => {
                      setPaymentReasonError("");
                      setPaymentReasonOpen(true);
                    }}
                    className="w-full sm:w-auto"
                  >
                    {paymentSecondary === "return" ? "Return" : "Reject"}
                  </Button>
                ) : null}
                {paymentAction ? (
                  <Button
                    variant="contained"
                    color={paymentAction.kind === "record" ? "success" : "primary"}
                    startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <PaymentsRounded />}
                    disabled={busy}
                    onClick={() => void runPaymentAction()}
                    className="w-full sm:w-auto"
                  >
                    {paymentAction.label}
                  </Button>
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
            { label: "Order value", value: activeOrder ? formatMoneyUGX(activeOrder.value) : null },
            { label: "Invoiced", value: formatMoneyUGX(invoicedTotal) },
            { label: "Paid", value: formatMoneyUGX(paidTotal) },
            ...(activeOrder && Math.abs(activeOrder.value - paidTotal) > 0.009
              ? [{ label: "Unpaid on order", value: formatMoneyUGX(Math.max(0, activeOrder.value - paidTotal)) }]
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
          providers={suppliers}
          onSubmitted={async () => {
            notifyOrgTasksChanged();
            await load();
          }}
        />
      ) : null}
      {bidDialogOpen && row ? (
        <OrgBidDocumentFillDialog
          open
          projectId={projectId}
          procurement={row}
          onClose={() => setBidDialogOpen(false)}
          onSaved={() => {
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
