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
  OrgReceiveInvoiceForm,
  SubmissionSourceChip,
} from "@/components/projects/org-procurement-supply-cards";
import { OrgEvaluationPanel } from "@/components/projects/org-evaluation-panel";
import Alert from "@mui/material/Alert";
import { ProcurementSectionGate } from "@/components/projects/org-procurement-stage-tracker";
import { RecordDetailsGrid } from "@/components/projects/record-details-grid";
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
  const [taskInvoiceId, setTaskInvoiceId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [closureRemarks, setClosureRemarks] = useState("");
  /** @type {[Record<string, string>, Function]} */
  const [deliveryQtys, setDeliveryQtys] = useState({});
  const [inspectionNotes, setInspectionNotes] = useState("");
  /** @type {[Record<string, { accepted: string; rejected: string }>, Function]} */
  const [inspectionLineEdits, setInspectionLineEdits] = useState({});
  const [inspectionCommitteeId, setInspectionCommitteeId] = useState("");
  /** @type {[Record<string, string>, Function]} */
  const [receiveErrors, setReceiveErrors] = useState({});
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
      setTaskInvoiceId("");
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
  const isReceiveInvoiceTask =
    /^receive\/record invoice|^receive.?record invoice|^process invoice|^invoice$/i.test(
      taskTitle.split(":")[0].trim(),
    );
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

  /**
   * @param {any} d
   * @param {boolean} acceptAll
   */
  async function inspectDelivery(d, acceptAll) {
    const lineDecisions = (d.lines || []).map((l) => {
      const edit = acceptAll ? null : inspectionLineEdits[l.id];
      return {
        lineId: l.id,
        acceptedQuantity: edit?.accepted ?? l.receivedQuantity,
        rejectedQuantity: edit?.rejected ?? 0,
      };
    });
    const body = {
      deliveryId: d.id,
      resultNotes: inspectionNotes.trim() || (acceptAll ? "Accepted in full." : "Inspection recorded."),
      lineDecisions,
      committeeId: inspectionCommitteeId || null,
      committeeRole: inspectionCommitteeId ? "INSPECTION" : null,
    };
    const ok = isAcceptGoodsTask
      ? await submitDeliveryTask(body, "Goods accepted.")
      : await runLifecycle("record_inspection", body, "Inspection saved.");
    if (ok) {
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
      if (isReceiveInvoiceTask && isPositiveDecision) {
        if (!taskInvoiceId) {
          showToast({
            message: "Receive the invoice in the Invoice section below, then choose it here.",
            severity: "error",
          });
          return;
        }
        payload.invoiceId = taskInvoiceId;
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
  const alreadyInvoiced = invoices
    .filter((i) => ["RECEIVED", "CERTIFIED", "VERIFIED", "APPROVED_FOR_PAYMENT"].includes(i.status))
    .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const nextInvoiceNumber = `INV-${row.procurementNumber || "PROC"}-${String(
    invoices.reduce((max, i) => {
      const m = String(i.invoiceNumber || "").match(/-(\d+)$/);
      return m ? Math.max(max, Number(m[1]) || 0) : max;
    }, 0) + 1,
  ).padStart(3, "0")}`;
  const acceptedDeliveries = (row.deliveries || []).filter(
    (d) => d.inspection && ["ACCEPTED", "PARTIAL"].includes(d.inspection.status),
  );
  const receivedInvoices = invoices.filter((i) =>
    (/^process invoice/i.test(taskTitle) ? ["RECEIVED", "CERTIFIED", "VERIFIED"] : ["RECEIVED"]).includes(
      i.status,
    ),
  );

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

            {isReceiveInvoiceTask ? (
              receivedInvoices.length ? (
                <TextField
                  select
                  label="Invoice received"
                  value={taskInvoiceId}
                  onChange={(e) => setTaskInvoiceId(e.target.value)}
                  helperText="Choose the invoice this step records"
                  fullWidth
                  className="sm:col-span-2"
                  sx={themedTextFieldSx}
                >
                  <MenuItem value="">—</MenuItem>
                  {receivedInvoices.map((inv) => (
                    <MenuItem key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} · {formatMoneyUGX(inv.amount)}
                      {inv.supplierReference ? ` · ref ${inv.supplierReference}` : ""}
                      {inv.source === "PORTAL"
                        ? " · via portal"
                        : inv.source === "AUTO"
                          ? " · auto-response provider"
                          : ""}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <Alert severity="warning" variant="outlined" className="sm:col-span-2">
                  No invoice has been received yet. Use &ldquo;Receive invoice from {providerWord}
                  &rdquo; in the Invoice section below (or wait for the {providerWord} to submit
                  through the portal), then complete this step.
                </Alert>
              )
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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
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
            <div className="space-y-2">
              <Typography variant="body2">
                <span className="font-semibold">{pendingDeliveryNote.noteNumber}</span> from{" "}
                {pendingDeliveryNote.supplier?.name || orderProvider} ·{" "}
                {formatPrintDate(pendingDeliveryNote.dispatchedAt)}
                {pendingDeliveryNote.remarks ? ` · ${pendingDeliveryNote.remarks}` : ""}
              </Typography>
              {canReceiveGoods ? (
                <>
                  {pendingDeliveryNote.lines.map((l) => (
                    <div key={l.itemName} className="grid gap-2 sm:grid-cols-[1fr_160px]">
                      <Typography variant="body2" className="self-center">
                        {l.itemName} — dispatched {l.quantity}
                        {l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ""}
                      </Typography>
                      <TextField
                        label="Received"
                        value={deliveryQtys[l.itemName] ?? l.quantity}
                        onChange={(e) => {
                          setDeliveryQtys((prev) => ({ ...prev, [l.itemName]: e.target.value }));
                          setReceiveErrors((prev) => ({ ...prev, [l.itemName]: "" }));
                        }}
                        error={Boolean(receiveErrors[l.itemName])}
                        helperText={receiveErrors[l.itemName] || undefined}
                        sx={themedTextFieldSx}
                        slotProps={{ htmlInput: { inputMode: "decimal" } }}
                      />
                    </div>
                  ))}
                  <Button
                    variant="contained"
                    startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleRounded />}
                    disabled={busy}
                    onClick={() => void receiveGoods()}
                    className="w-full sm:w-auto"
                  >
                    Confirm receipt
                  </Button>
                </>
              ) : (
                <Typography variant="body2" sx={adminMutedTextSx}>
                  Awaiting receipt by the user department.
                </Typography>
              )}
            </div>
          ) : allReceived ? null : (
            <Typography variant="body2" sx={adminMutedTextSx}>
              {orderNotOpen ||
                (deliveries.length
                  ? `Waiting for the next delivery from ${orderProvider}.`
                  : `Waiting for ${orderProvider} to deliver.`)}
            </Typography>
          )}

          {deliveries.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {deliveries.map((d) => (
                <li key={d.id} className="rounded border border-[color:var(--border-subtle)] p-2">
                  <p className="font-medium">
                    {d.deliveryDate ? formatPrintDate(d.deliveryDate) : "—"}
                    {d.deliveryNote?.noteNumber ? ` · ${d.deliveryNote.noteNumber}` : ""}
                    {d.recordedBy?.displayName ? ` · Received by ${d.recordedBy.displayName}` : ""}
                  </p>
                  <ul className="mt-1 list-disc pl-5">
                    {(d.lines || []).map((l) => (
                      <li key={l.id}>
                        {l.itemName}: {l.receivedQuantity}
                        {l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ""} of {l.orderedQuantity}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : null}

          {isReceiveGoodsTask && !pendingDeliveryNote && deliveries.length ? (
            <Button
              variant="contained"
              startIcon={<CheckCircleRounded />}
              disabled={busy}
              onClick={() => void submitDeliveryTask({}, "Goods received.")}
              className="mt-3 w-full sm:w-auto"
            >
              Confirm receipt
            </Button>
          ) : null}
        </Paper>

        {deliveries.length ? (
          <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Inspect &amp; accept goods
              </Typography>
              {allInspected ? (
                <Chip size="small" color="success" label="Inspected" />
              ) : (
                <Chip size="small" color="warning" variant="outlined" label="Awaiting inspection" />
              )}
            </div>
            <ul className="space-y-2 text-sm">
              {deliveries.map((d) => (
                <li key={d.id} className="rounded border border-[color:var(--border-subtle)] p-2">
                  <p className="font-medium">
                    {d.deliveryNote?.noteNumber || (d.deliveryDate ? formatPrintDate(d.deliveryDate) : "Delivery")}
                    {d.inspection
                      ? ` · ${d.inspection.status}${
                          d.inspection.inspectedBy?.displayName ? ` by ${d.inspection.inspectedBy.displayName}` : ""
                        }`
                      : ""}
                  </p>
                  {d.inspection ? (
                    <ul className="mt-1 list-disc pl-5">
                      {(d.lines || []).map((l) => (
                        <li key={l.id}>
                          {l.itemName}: accepted {l.acceptedQuantity}
                          {Number(l.rejectedQuantity) > 0 ? `, rejected ${l.rejectedQuantity}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : canInspectGoods ? (
                    <div className="mt-2 space-y-2">
                      {(d.lines || []).map((l) => {
                        const edit = inspectionLineEdits[l.id] || {
                          accepted: String(l.receivedQuantity ?? ""),
                          rejected: "0",
                        };
                        return (
                          <div key={l.id} className="grid gap-2 sm:grid-cols-[1fr_120px_120px]">
                            <Typography variant="body2" className="self-center">
                              {l.itemName} — received {l.receivedQuantity}
                            </Typography>
                            <TextField
                              label="Accepted"
                              value={edit.accepted}
                              onChange={(e) =>
                                setInspectionLineEdits((prev) => ({
                                  ...prev,
                                  [l.id]: { ...edit, accepted: e.target.value },
                                }))
                              }
                              sx={themedTextFieldSx}
                              slotProps={{ htmlInput: { inputMode: "decimal" } }}
                            />
                            <TextField
                              label="Rejected"
                              value={edit.rejected}
                              onChange={(e) =>
                                setInspectionLineEdits((prev) => ({
                                  ...prev,
                                  [l.id]: { ...edit, rejected: e.target.value },
                                }))
                              }
                              sx={themedTextFieldSx}
                              slotProps={{ htmlInput: { inputMode: "decimal" } }}
                            />
                          </div>
                        );
                      })}
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
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="contained"
                          color="success"
                          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleRounded />}
                          disabled={busy || !(d.lines || []).length}
                          onClick={() => void inspectDelivery(d, true)}
                          className="w-full sm:w-auto"
                        >
                          Accept all
                        </Button>
                        <Button
                          variant="outlined"
                          startIcon={<FactCheckRounded />}
                          disabled={busy || !(d.lines || []).length}
                          onClick={() => void inspectDelivery(d, false)}
                          className="w-full sm:w-auto"
                        >
                          Save inspection
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Typography variant="body2" sx={adminMutedTextSx}>
                      Awaiting inspection.
                    </Typography>
                  )}
                </li>
              ))}
            </ul>

            {isAcceptGoodsTask && allInspected ? (
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircleRounded />}
                disabled={busy}
                onClick={() => void submitDeliveryTask({}, "Delivery accepted.")}
                className="mt-3 w-full sm:w-auto"
              >
                Accept delivery
              </Button>
            ) : null}
          </Paper>
        ) : null}
      </div>
      </ProcurementSectionGate>
      ) : null}

      {on("invoice") ? (
      <ProcurementSectionGate access={sections?.invoice}>
      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Invoice
        </Typography>
        {invoices.length === 0 ? (
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
            No invoices yet.
          </Typography>
        ) : (
          <ul className="mb-3 space-y-2 text-sm">
            {invoices.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-(--border-subtle) p-2"
              >
                <span>
                  {inv.invoiceNumber} · {formatMoneyUGX(inv.amount)} · {inv.status}
                  {inv.supplier?.name ? ` · ${inv.supplier.name}` : ""}
                  {inv.supplierReference ? ` · ref ${inv.supplierReference}` : ""}
                </span>
                <SubmissionSourceChip source={inv.source} />
                {activeOrder && Math.abs((Number(inv.amount) || 0) - activeOrder.value) > 0.009 ? (
                  <Chip
                    size="small"
                    color="warning"
                    variant="outlined"
                    label={`Differs from order value (${formatMoneyUGX(activeOrder.value)})`}
                  />
                ) : null}
                {inv.deliveryAddress ? (
                  <span className="w-full text-xs opacity-80 wrap-break-word">
                    Delivered to: {inv.deliveryAddress}
                  </span>
                ) : null}
                {inv.notes ? <span className="w-full text-xs opacity-70">{inv.notes}</span> : null}
                {inv.status === "RECEIVED" ? (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy}
                    onClick={() =>
                      void runLifecycle("certify_invoice", {
                        invoiceId: inv.id,
                      })
                    }
                  >
                    Certify
                  </Button>
                ) : null}
                {inv.status === "CERTIFIED" ? (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy}
                    onClick={() => void runLifecycle("verify_invoice", { invoiceId: inv.id })}
                  >
                    Verify
                  </Button>
                ) : null}
                {["RECEIVED", "CERTIFIED"].includes(inv.status) ? (
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    disabled={busy || !rejectReason.trim()}
                    title="Enter a rejection reason below first"
                    onClick={() =>
                      void runLifecycle("reject_invoice", {
                        invoiceId: inv.id,
                        reason: rejectReason.trim(),
                      })
                    }
                  >
                    Reject
                  </Button>
                ) : null}
                {inv.rejectionReason ? (
                  <span className="text-[color:var(--brand-red)]">— {inv.rejectionReason}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <OrgReceiveInvoiceForm
          key={`${activeOrder?.number || "none"}-${alreadyInvoiced}-${acceptedDeliveries.length}`}
          order={activeOrder}
          alreadyInvoiced={alreadyInvoiced}
          acceptedDeliveries={acceptedDeliveries}
          providerWord={providerWord}
          nextInvoiceNumber={nextInvoiceNumber}
          busy={busy}
          onSubmit={(body) => runLifecycle("create_invoice", body, "Invoice received.")}
        />
        <TextField
          label="Reject reason (invoice / payment)"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          size="small"
          fullWidth
          sx={{ ...themedTextFieldSx, mt: 2 }}
          helperText="Required before rejecting an invoice or payment"
        />
      </Paper>
      </ProcurementSectionGate>
      ) : null}

      {on("payment") ? (
      <ProcurementSectionGate access={sections?.payment}>
      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Payment
        </Typography>
        {(row.payments || []).length === 0 ? (
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
            No payments yet. The invoice must be verified before a payment can be raised.
          </Typography>
        ) : (
          <ul className="mb-3 space-y-2 text-sm">
            {row.payments.map((pay) => (
              <li key={pay.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {formatMoneyUGX(pay.amount)} · {pay.status}
                  {pay.paymentReference ? ` · ${pay.paymentReference}` : ""}
                </span>
                {pay.status === "PENDING" ? (
                  <>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        void runLifecycle("approve_payment", {
                          paymentId: pay.id,
                        })
                      }
                    >
                      Approve payment
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      disabled={busy || !rejectReason.trim()}
                      onClick={() =>
                        void runLifecycle("reject_payment", {
                          paymentId: pay.id,
                          reason: rejectReason.trim(),
                        })
                      }
                    >
                      Reject
                    </Button>
                  </>
                ) : null}
                {pay.status === "APPROVED" ? (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy}
                    onClick={() =>
                      void runLifecycle("mark_payment_paid", {
                        paymentId: pay.id,
                      })
                    }
                  >
                    Mark paid
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <TextField
            select
            label="Verified invoice"
            value={
              (row.invoices || []).find((i) =>
                ["VERIFIED", "APPROVED_FOR_PAYMENT"].includes(i.status),
              )?.id || ""
            }
            onChange={() => {}}
            size="small"
            sx={{ ...themedTextFieldSx, minWidth: 200 }}
            disabled
            helperText="Uses the latest verified invoice automatically when raising payment"
          >
            {(row.invoices || [])
              .filter((i) => ["VERIFIED", "APPROVED_FOR_PAYMENT"].includes(i.status))
              .map((i) => (
                <MenuItem key={i.id} value={i.id}>
                  {i.invoiceNumber} · {formatMoneyUGX(i.amount)}
                </MenuItem>
              ))}
          </TextField>
          <TextField
            label="Payment amount"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            size="small"
            sx={{ ...themedTextFieldSx, minWidth: 140 }}
          />
          <TextField
            label="Payment reference"
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            size="small"
            sx={{ ...themedTextFieldSx, minWidth: 140 }}
          />
          <Button
            variant="contained"
            disabled={busy || !paymentAmount.trim()}
            onClick={() => {
              const inv = (row.invoices || []).find((i) =>
                ["VERIFIED", "APPROVED_FOR_PAYMENT"].includes(i.status),
              );
              if (!inv) {
                showToast({
                  message: "Verify an invoice before raising a payment.",
                  severity: "error",
                });
                return;
              }
              void runLifecycle("create_payment", {
                invoiceId: inv.id,
                amount: paymentAmount.trim(),
                paymentReference: paymentRef.trim() || null,
              });
            }}
          >
            Raise payment
          </Button>
        </div>
      </Paper>
      </ProcurementSectionGate>
      ) : null}

      {on("closure") ? (
      <ProcurementSectionGate access={sections?.closure}>
      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Closure
        </Typography>
        {row.status === "CLOSED" ? (
          <Typography variant="body2">
            Closed
            {row.closedAt ? ` on ${String(row.closedAt).slice(0, 10)}` : ""}
            {row.closedBy?.displayName ? ` by ${row.closedBy.displayName}` : ""}
            {row.closureRemarks ? ` — ${row.closureRemarks}` : ""}
          </Typography>
        ) : (
          <div className="space-y-2">
            {closure && !closure.ready && (closure.blockers || []).length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-[color:var(--brand-red)]">
                {closure.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : (
              <Typography variant="body2" sx={adminMutedTextSx}>
                All known closure gates appear satisfied. Closing is final.
              </Typography>
            )}
            <TextField
              label="Closure remarks"
              value={closureRemarks}
              onChange={(e) => setClosureRemarks(e.target.value)}
              fullWidth
              size="small"
              sx={themedTextFieldSx}
            />
            <Button
              variant="contained"
              color="error"
              disabled={busy}
              onClick={() =>
                void runLifecycle("close_procurement", {
                  remarks: closureRemarks || null,
                })
              }
            >
              Close procurement
            </Button>
          </div>
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
