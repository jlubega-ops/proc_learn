"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import DescriptionRounded from "@mui/icons-material/DescriptionRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { format, isValid, parseISO } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import { OrgBidDocumentFillDialog } from "@/components/projects/org-bid-document-fill-dialog";
import {
  adminCenteredLoadingBoxSx,
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
import {
  OrgProcurementStageTracker,
  ProcurementSectionGate,
} from "@/components/projects/org-procurement-stage-tracker";

/**
 * @param {{ projectId: string; procurementId: string }} p
 */
export function OrgProcurementDetailPanel({ projectId, procurementId }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [row, setRow] = useState(/** @type {any} */ (null));
  const [pendingTask, setPendingTask] = useState(/** @type {any} */ (null));
  const [blockedTask, setBlockedTask] = useState(/** @type {any} */ (null));
  const [workflowProgress, setWorkflowProgress] = useState(/** @type {any} */ (null));
  const [sections, setSections] = useState(/** @type {Record<string, any> | null} */ (null));
  const [viewerCommitteeType, setViewerCommitteeType] = useState(/** @type {string | null} */ (null));
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
  const [committees, setCommittees] = useState(/** @type {any[]} */ ([]));
  const [rejectReason, setRejectReason] = useState("");
  const [cancelAwardReason, setCancelAwardReason] = useState("");
  const [bidDialogOpen, setBidDialogOpen] = useState(false);

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
      setClosure(data.closure || null);
      setBlockedTask(data.blockedTask || null);
      setWorkflowProgress(data.workflowProgress || null);
      setSections(data.viewer?.sections || null);
      setViewerCommitteeType(data.viewer?.committeeType || null);
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
  const isPositiveDecision = isPositiveWorkflowDecision(decision);
  const stepActionLabel = workflowStepActionLabel(taskTitle);
  const usesProviderPicker = (isIssuePi || isRfqIssue) && isPositiveDecision;
  const reqCategory = row?.requisition?.category || null;
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

  async function submitDecision() {
    if (!pendingTask?.id) return;
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
          ? `${baseMessage} ${autoCount} simulated ${autoCount === 1 ? providerWord : providerWordPlural} responded.`
          : baseMessage,
        severity: "success",
      });
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
  } else if (pi && pi.status === "ISSUED") {
    activeOrder = {
      number: pi.instructionNumber,
      value: Number(pi.amount) || 0,
      supplierName: pi.supplier?.name || null,
      deliveryAddress: pi.deliveryAddress || requisitionAddress,
    };
  }
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          component={Link}
          href={`/projects/${projectId}/procurements`}
          startIcon={<ArrowBackRounded />}
          variant="outlined"
        >
          Back to procurements
        </Button>
        <Button startIcon={<RefreshRounded />} variant="outlined" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {row.procurementNumber}
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {row.title}
            </Typography>
            <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 0.5 }}>
              Procurement case — one identity across requisition, method, solicitation, evaluation,
              award, delivery, invoice, payment and closure.
            </Typography>
            <Typography variant="body2" sx={adminMutedTextSx}>
              {row.financialYear?.label || "—"} · {row.department?.name || "—"}
              {row.officer?.displayName ? ` · Officer ${row.officer.displayName}` : ""}
            </Typography>
          </div>
          <div className="flex flex-wrap gap-1">
            <Chip size="small" color="info" label={row.procurementMethod} />
            <Chip size="small" color="primary" label={row.status} />
          </div>
        </div>

        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="font-semibold">Requisition:</span>{" "}
            {row.requisition ? (
              <Link
                href={`/projects/${projectId}/requisitions/${row.requisition.id}`}
                className="cursor-pointer font-semibold text-primary underline"
              >
                {row.requisition.requisitionReference || row.requisition.title}
              </Link>
            ) : (
              "—"
            )}
          </p>
          <p>
            <span className="font-semibold">Estimated value:</span>{" "}
            {formatMoneyUGX(row.requisition?.estimatedTotalValue)}
          </p>
          <p>
            <span className="font-semibold">Plan item:</span>{" "}
            {row.procurementPlanItem?.title || "—"}
          </p>
          <p>
            <span className="font-semibold">Budget line:</span>{" "}
            {row.budgetLine ? `${row.budgetLine.code} — ${row.budgetLine.name}` : "—"}
          </p>
        </div>
      </Paper>

      <OrgProcurementStageTracker
        progress={workflowProgress}
        blockedTask={blockedTask}
        hasOwnTask={Boolean(pendingTask)}
      />

      {pendingTask ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            {pendingTask.title.split(":")[0]}
          </Typography>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              select
              label="Decision"
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              fullWidth
              sx={themedTextFieldSx}
            >
              {workflowDecisionOptions(actionKey, { isProcurementStep: true }).map((opt) => (
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

            {isRfqIssue || isTenderAdvertise ? (
              <>
                <TextField
                  label="Closing date"
                  type="datetime-local"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  sx={themedTextFieldSx}
                />
              </>
            ) : null}

            {isReceive ? (
              <>
                <Alert severity="info" variant="outlined" className="sm:col-span-2">
                  {offers.filter((o) => o.status !== "WITHDRAWN").length} offer(s) received so far
                  (see the list below). Simulated {providerWordPlural} respond automatically and
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
                          ? " · simulated provider"
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
          {usesProviderPicker ? (
            <div className="mt-3">
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
                label={
                  isIssuePi
                    ? `Select ${providerWord}`
                    : `${providerTerm(reqCategory, { plural: true, capitalize: true })} to invite`
                }
                helperText={
                  (row.requisition?.shortlist || []).length ? "Prefilled from Form 5 Part II." : undefined
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
                onConfirm={() => submitDecision()}
              />
            </div>
          ) : (
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
          )}
        </Paper>
      ) : null}

      {pi ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            Purchase instruction
          </Typography>
          <p className="text-sm">
            <span className="font-semibold">{pi.instructionNumber}</span> · {pi.status} ·{" "}
            {formatMoneyUGX(pi.amount)}
          </p>
          <p className="text-sm">
            Supplier: {pi.supplier?.name || "—"}
            {pi.issuedBy?.displayName ? ` · Issued by ${pi.issuedBy.displayName}` : ""}
          </p>
          <OrgDeliveryAddressLine address={pi.deliveryAddress} fallback={requisitionAddress} />
        </Paper>
      ) : null}

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

      {(row.procurementMethod === "QUOTATION" || row.procurementMethod === "TENDER") &&
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
        </>
      ) : null}

      <ProcurementSectionGate access={sections?.delivery}>
      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Delivery &amp; inspection
        </Typography>
        {(row.deliveries || []).length === 0 ? (
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
            No deliveries recorded. An issued Purchase Instruction, accepted LPO, or active contract
            is required before delivery can be recorded. Partial deliveries are allowed — record
            received quantities against each requisition line.
          </Typography>
        ) : (
          <ul className="mb-3 space-y-2 text-sm">
            {row.deliveries.map((d) => (
              <li key={d.id} className="rounded border border-[color:var(--border-subtle)] p-2">
                <p>
                  {d.status}
                  {d.deliveryDate ? ` · ${String(d.deliveryDate).slice(0, 10)}` : ""}
                  {d.recordedBy?.displayName ? ` · ${d.recordedBy.displayName}` : ""}
                </p>
                {d.deliveryAddress ? (
                  <p className="text-xs opacity-80 wrap-break-word">
                    Delivered to: {d.deliveryAddress}
                  </p>
                ) : null}
                <ul className="mt-1 list-disc pl-5">
                  {(d.lines || []).map((l) => (
                    <li key={l.id}>
                      {l.itemName}: received {l.receivedQuantity}
                      {l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ""} (ordered {l.orderedQuantity};
                      accepted {l.acceptedQuantity}; rejected {l.rejectedQuantity})
                    </li>
                  ))}
                </ul>
                {d.inspection ? (
                  <p className="mt-1 opacity-80">
                    Inspection: {d.inspection.status}
                    {d.inspection.inspectedBy?.displayName
                      ? ` · ${d.inspection.inspectedBy.displayName}`
                      : ""}
                    {d.inspection.committeeRole ? ` · ${d.inspection.committeeRole}` : ""}
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {row.procurementMethod === "MICRO" ? (
                      <Typography variant="body2" sx={adminMutedTextSx}>
                        Micro procurement: the Head of User Department accepts the goods — no
                        inspection committee is required.
                      </Typography>
                    ) : (
                    <TextField
                      select
                      label="Inspection committee (optional)"
                      value={inspectionCommitteeId}
                      onChange={(e) => setInspectionCommitteeId(e.target.value)}
                      fullWidth
                      size="small"
                      sx={themedTextFieldSx}
                      helperText="Prefer an Inspection committee when one exists"
                    >
                      <MenuItem value="">None</MenuItem>
                      {committees
                        .filter((c) => c.isActive && c.committeeType === "INSPECTION_ACCEPTANCE")
                        .map((c) => (
                          <MenuItem key={c.id} value={c.id}>
                            {c.name}
                          </MenuItem>
                        ))}
                      {committees
                        .filter((c) => c.isActive && c.committeeType !== "INSPECTION_ACCEPTANCE")
                        .map((c) => (
                          <MenuItem key={`other-${c.id}`} value={c.id}>
                            {c.name} ({c.committeeType})
                          </MenuItem>
                        ))}
                    </TextField>
                    )}
                    <TextField
                      label="Inspection notes"
                      value={inspectionNotes}
                      onChange={(e) => setInspectionNotes(e.target.value)}
                      fullWidth
                      size="small"
                      sx={themedTextFieldSx}
                    />
                    {(d.lines || []).map((l) => {
                      const edit = inspectionLineEdits[l.id] || {
                        accepted: String(l.receivedQuantity ?? ""),
                        rejected: "0",
                      };
                      return (
                        <div key={l.id} className="grid gap-2 sm:grid-cols-[1fr_120px_120px]">
                          <Typography variant="body2" className="self-center">
                            {l.itemName} (received {l.receivedQuantity})
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
                            size="small"
                            sx={themedTextFieldSx}
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
                            size="small"
                            sx={themedTextFieldSx}
                          />
                        </div>
                      );
                    })}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={busy || !(d.lines || []).length}
                        onClick={() => {
                          const lineDecisions = (d.lines || []).map((l) => {
                            const edit = inspectionLineEdits[l.id];
                            return {
                              lineId: l.id,
                              acceptedQuantity: edit?.accepted ?? l.receivedQuantity,
                              rejectedQuantity: edit?.rejected ?? 0,
                            };
                          });
                          void runLifecycle("record_inspection", {
                            deliveryId: d.id,
                            resultNotes: inspectionNotes || "Inspection recorded.",
                            lineDecisions,
                            committeeId: inspectionCommitteeId || null,
                            committeeRole: inspectionCommitteeId ? "INSPECTION" : null,
                          });
                        }}
                      >
                        Record inspection
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        disabled={busy || !(d.lines || []).length}
                        onClick={() => {
                          const lineDecisions = (d.lines || []).map((l) => ({
                            lineId: l.id,
                            acceptedQuantity: l.receivedQuantity,
                            rejectedQuantity: 0,
                          }));
                          void runLifecycle("record_inspection", {
                            deliveryId: d.id,
                            resultNotes: inspectionNotes || "Accepted in full.",
                            lineDecisions,
                            committeeId: inspectionCommitteeId || null,
                            committeeRole: inspectionCommitteeId ? "INSPECTION" : null,
                          });
                        }}
                      >
                        Accept all received
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Record (partial) delivery
          </Typography>
          {(row.requisition?.items || []).length === 0 ? (
            <Typography variant="body2" sx={adminMutedTextSx}>
              No requisition lines available to deliver against.
            </Typography>
          ) : (
            <div className="space-y-2">
              {row.requisition.items.map((it) => (
                <div key={it.id} className="grid gap-2 sm:grid-cols-[1fr_140px]">
                  <Typography variant="body2" className="self-center">
                    {it.itemName} — ordered {it.quantity}
                    {it.unitOfMeasure ? ` ${it.unitOfMeasure}` : ""}
                  </Typography>
                  <TextField
                    label="Received qty"
                    value={deliveryQtys[it.itemName] || ""}
                    onChange={(e) =>
                      setDeliveryQtys((prev) => ({
                        ...prev,
                        [it.itemName]: e.target.value,
                      }))
                    }
                    size="small"
                    sx={themedTextFieldSx}
                    inputProps={{ inputMode: "decimal" }}
                  />
                </div>
              ))}
              <Button
                variant="contained"
                disabled={
                  busy ||
                  !Object.values(deliveryQtys).some((v) => String(v || "").trim() && Number(v) > 0)
                }
                onClick={() => {
                  const lines = Object.entries(deliveryQtys)
                    .filter(([, qty]) => String(qty || "").trim() && Number(qty) > 0)
                    .map(([itemName, receivedQuantity]) => ({
                      itemName,
                      receivedQuantity: String(receivedQuantity).trim(),
                    }));
                  void runLifecycle("record_delivery", {
                    lines,
                    remarks: "Recorded from procurement case page.",
                  });
                }}
              >
                Record delivery
              </Button>
            </div>
          )}
        </div>
      </Paper>
      </ProcurementSectionGate>

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
                All known closure gates appear satisfied. Closing is final for this simulation case.
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

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <details>
        <summary className="cursor-pointer select-none text-base font-semibold">
          Lifecycle timeline
          <span className="ml-2 text-sm font-normal opacity-70">
            ({(row.timeline || []).length} events)
          </span>
        </summary>
        {(row.timeline || []).length === 0 ? (
          <Typography sx={{ ...adminMutedTextSx, mt: 1.5 }}>No events yet.</Typography>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {row.timeline.map((a) => {
              let when = "—";
              if (a.createdAt) {
                const d =
                  typeof a.createdAt === "string" ? parseISO(a.createdAt) : new Date(a.createdAt);
                if (isValid(d)) when = format(d, "d MMM yyyy, h:mm a");
              }
              const who = a.actor?.displayName || "—";
              const role = a.actorRoleName || "—";
              const actionLine = a.actionText || a.decision || "Recorded action";
              const statusLabel =
                a.statusTransition?.label ||
                (a.previousStatus && a.newStatus
                  ? `Status: ${a.previousStatus} → ${a.newStatus}`
                  : null);
              return (
                <li
                  key={a.id}
                  className="rounded-lg border border-[color:var(--border-subtle)] p-2"
                >
                  <p className="text-xs opacity-70">{when}</p>
                  <p className="font-semibold">
                    {who} — {role}
                  </p>
                  {a.departmentName ? (
                    <p className="text-xs opacity-80">Department: {a.departmentName}</p>
                  ) : null}
                  {a.committeeRole ? (
                    <p className="text-xs opacity-80">
                      Committee role: {String(a.committeeRole).replace(/_/g, " ")}
                    </p>
                  ) : null}
                  <p>{actionLine}</p>
                  {a.amountLabel ? (
                    <p className="text-xs opacity-80">Amount: {a.amountLabel}</p>
                  ) : null}
                  {statusLabel ? <p className="text-xs opacity-80">{statusLabel}</p> : null}
                  {a.comment ? <p className="text-xs opacity-80">Comment: {a.comment}</p> : null}
                  {a.processName ? (
                    <p className="text-xs opacity-70">Process: {a.processName}</p>
                  ) : null}
                  {a.source === "domain" ? (
                    <p className="text-xs opacity-60">Source: lifecycle audit</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        </details>
      </Paper>
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
