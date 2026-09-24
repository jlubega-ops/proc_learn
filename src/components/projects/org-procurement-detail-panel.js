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
  workflowDecisionHelp,
  workflowDecisionOptions,
} from "@/lib/projects/workflow-decision-options";
import { workflowDecisionButtonLabel } from "@/lib/projects/workflow-status-presentation";

/**
 * @param {{ projectId: string; procurementId: string }} p
 */
export function OrgProcurementDetailPanel({ projectId, procurementId }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [row, setRow] = useState(/** @type {any} */ (null));
  const [pendingTask, setPendingTask] = useState(/** @type {any} */ (null));
  const [closure, setClosure] = useState(/** @type {{ ready?: boolean; blockers?: string[] } | null} */ (null));
  const [decision, setDecision] = useState("APPROVE");
  const [comment, setComment] = useState("");
  const [suppliers, setSuppliers] = useState(/** @type {any[]} */ ([]));
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [inviteSupplierIds, setInviteSupplierIds] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [offerSupplierId, setOfferSupplierId] = useState("");
  const [offerAmount, setOfferAmount] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceDeliveryId, setInvoiceDeliveryId] = useState("");
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
      const task = data.pendingTask || null;
      setPendingTask(task);
      const key = String(task?.actionKey || "").toUpperCase();
      setDecision(defaultWorkflowDecision(key));
      setComment("");
      setSupplierId("");
      setNewSupplierName("");
      setInviteSupplierIds("");
      setClosingDate("");
      setOfferSupplierId("");
      setOfferAmount("");
      setInvoiceAmount("");
      setInvoiceDeliveryId("");
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
      const res = await fetch(`/api/projects/${projectId}/suppliers`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSuppliers(Array.isArray(data.suppliers) ? data.suppliers : []);
    } catch {
      // optional for roles without VIEW_SUPPLIERS
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
  const isReceive =
    /receive quotations/i.test(taskTitle) || /receive bids/i.test(taskTitle);

  async function runLifecycle(action, body = {}) {
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
      showToast({ message: "Lifecycle action recorded.", severity: "success" });
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function submitDecision() {
    if (!pendingTask?.id) return;
    setBusy(true);
    try {
      /** @type {Record<string, any>} */
      const payload = {
        taskId: pendingTask.id,
        decision,
        comment,
      };
      if (isIssuePi) {
        if (supplierId) payload.supplierId = supplierId;
        else if (newSupplierName.trim()) {
          payload.supplier = { name: newSupplierName.trim() };
        }
      }
      if (isRfqIssue || isTenderAdvertise) {
        payload.inviteSupplierIds = inviteSupplierIds
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (closingDate) payload.closingDate = closingDate;
      }
      if (isReceive && (decision === "COMPLETE" || decision === "APPROVE" || decision === "SUBMIT")) {
        payload.offer = {
          supplierId: offerSupplierId || undefined,
          amount: offerAmount,
        };
      }
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not record decision.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Decision recorded.", severity: "success" });
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
              Procurement case — one identity across requisition, method, solicitation,
              evaluation, award, delivery, invoice, payment and closure.
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
            <span className="font-semibold">Plan item:</span> {row.procurementPlanItem?.title || "—"}
          </p>
          <p>
            <span className="font-semibold">Budget line:</span>{" "}
            {row.budgetLine ? `${row.budgetLine.code} — ${row.budgetLine.name}` : "—"}
          </p>
        </div>
      </Paper>

      {pendingTask ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Review task: {pendingTask.title}
          </Typography>
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
            Role: {pendingTask.requiredRoleName}
          </Typography>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              select
              label="Decision"
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              fullWidth
              sx={themedTextFieldSx}
              helperText={workflowDecisionHelp(decision)}
            >
              {workflowDecisionOptions(actionKey).map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>

            {isIssuePi ? (
              <>
                <TextField
                  select
                  label="Supplier"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  fullWidth
                  sx={themedTextFieldSx}
                  helperText="Choose an existing supplier or add a new name below."
                >
                  <MenuItem value="">— Add new —</MenuItem>
                  {suppliers.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name}
                    </MenuItem>
                  ))}
                </TextField>
                {!supplierId ? (
                  <TextField
                    label="New supplier name"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    fullWidth
                    className="sm:col-span-2"
                    sx={themedTextFieldSx}
                  />
                ) : null}
              </>
            ) : null}

            {isRfqIssue || isTenderAdvertise ? (
              <>
                <TextField
                  label="Invite supplier ids (comma-separated)"
                  value={inviteSupplierIds}
                  onChange={(e) => setInviteSupplierIds(e.target.value)}
                  fullWidth
                  className="sm:col-span-2"
                  sx={themedTextFieldSx}
                  helperText="Use ids from Suppliers. At least one invite is required."
                />
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
                <TextField
                  select
                  label="Offer supplier"
                  value={offerSupplierId}
                  onChange={(e) => setOfferSupplierId(e.target.value)}
                  fullWidth
                  sx={themedTextFieldSx}
                >
                  <MenuItem value="">—</MenuItem>
                  {suppliers.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Offer amount (UGX)"
                  value={offerAmount}
                  onChange={(e) => setOfferAmount(e.target.value)}
                  fullWidth
                  sx={themedTextFieldSx}
                />
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
          <div className="mt-3">
            <Button
              variant="contained"
              color={decision === "REJECT" ? "error" : "primary"}
              disabled={busy}
              onClick={() => void submitDecision()}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {workflowDecisionButtonLabel(decision, { busy })}
            </Button>
          </div>
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
        </Paper>
      ) : null}

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
                {(s.invites || []).length
                  ? ` · ${s.invites.length} invited`
                  : ""}
                {s.bidDocumentAt
                  ? ` · bid/RFQ filled ${String(s.bidDocumentAt).slice(0, 10)}`
                  : ""}
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
            solicitation if needed. Download a branded PDF from the fill dialog (named from the procurement reference).
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

      {offers.length > 0 ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            Quotations / bids
          </Typography>
          <ul className="space-y-1 text-sm">
            {offers.map((o) => (
              <li key={o.id}>
                {o.offerType} · {o.supplier?.name || "—"} · {formatMoneyUGX(o.amount)} · {o.status}
              </li>
            ))}
          </ul>
        </Paper>
      ) : null}

      {(row.evaluationReports || []).length > 0 ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            Evaluation
          </Typography>
          <ul className="space-y-1 text-sm">
            {row.evaluationReports.map((er) => (
              <li key={er.id}>
                {er.status}
                {er.recommendedSupplier?.name ? ` · ${er.recommendedSupplier.name}` : ""}
                {er.evaluatedAmount ? ` · ${formatMoneyUGX(er.evaluatedAmount)}` : ""}
              </li>
            ))}
          </ul>
        </Paper>
      ) : null}

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
                  onClick={() => void runLifecycle("communicate_award", { awardId: row.award.id })}
                >
                  Communicate award
                </Button>
              ) : null}
              {row.award.status === "COMMUNICATED" ? (
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busy}
                  onClick={() => void runLifecycle("accept_award", { awardId: row.award.id })}
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
              No award yet. Create an award only after an evaluation report is approved
              {row.requiresPostQualification ? " and post-qualification is complete" : ""}.
            </Typography>
            <Button
              size="small"
              variant="contained"
              disabled={busy || row.status === "CLOSED"}
              onClick={() => void runLifecycle("create_award")}
            >
              Create award from evaluation
            </Button>
          </div>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Contract / LPO
        </Typography>
        {row.lpo ? (
          <div className="space-y-2 text-sm">
            <p>
              LPO <span className="font-semibold">{row.lpo.lpoNumber}</span> · {row.lpo.status} ·{" "}
              {formatMoneyUGX(row.lpo.lpoValue)}
            </p>
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
            </p>
            <div className="flex flex-wrap gap-2">
              {row.contract.status === "DRAFT" ? (
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busy}
                  onClick={() =>
                    void runLifecycle("approve_contract", { contractId: row.contract.id })
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
                    void runLifecycle("sign_contract", { contractId: row.contract.id })
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
                    void runLifecycle("issue_contract", { contractId: row.contract.id })
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
            {row.procurementMethod === "MICRO" ? (
              <Typography variant="body2" sx={adminMutedTextSx}>
                Micro Procurement uses a Purchase Instruction (above) instead of an LPO/contract.
              </Typography>
            ) : null}
          </div>
        )}
      </Paper>

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
                    {d.inspection.committeeRole
                      ? ` · ${d.inspection.committeeRole}`
                      : ""}
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
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
                        .filter(
                          (c) =>
                            c.isActive && c.committeeType !== "INSPECTION_ACCEPTANCE",
                        )
                        .map((c) => (
                          <MenuItem key={`other-${c.id}`} value={c.id}>
                            {c.name} ({c.committeeType})
                          </MenuItem>
                        ))}
                    </TextField>
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
                        <div
                          key={l.id}
                          className="grid gap-2 sm:grid-cols-[1fr_120px_120px]"
                        >
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
                      setDeliveryQtys((prev) => ({ ...prev, [it.itemName]: e.target.value }))
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

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Invoice
        </Typography>
        {(row.invoices || []).length === 0 ? (
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
            No invoices yet. An accepted inspection is required before an invoice can be raised.
            Optionally link the invoice to a specific delivery.
          </Typography>
        ) : (
          <ul className="mb-3 space-y-2 text-sm">
            {row.invoices.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {inv.invoiceNumber} · {formatMoneyUGX(inv.amount)} · {inv.status}
                  {inv.deliveryId ? " · linked to delivery" : ""}
                </span>
                {inv.status === "RECEIVED" ? (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy}
                    onClick={() => void runLifecycle("certify_invoice", { invoiceId: inv.id })}
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
        <div className="flex flex-wrap items-end gap-2">
          <TextField
            select
            label="Link to delivery (optional)"
            value={invoiceDeliveryId}
            onChange={(e) => setInvoiceDeliveryId(e.target.value)}
            size="small"
            sx={{ ...themedTextFieldSx, minWidth: 220 }}
          >
            <MenuItem value="">No specific delivery</MenuItem>
            {(row.deliveries || [])
              .filter((d) => d.inspection && ["ACCEPTED", "PARTIAL"].includes(d.inspection.status))
              .map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.status}
                  {d.deliveryDate ? ` · ${String(d.deliveryDate).slice(0, 10)}` : ""}
                </MenuItem>
              ))}
          </TextField>
          <TextField
            label="Invoice amount"
            value={invoiceAmount}
            onChange={(e) => setInvoiceAmount(e.target.value)}
            size="small"
            sx={{ ...themedTextFieldSx, minWidth: 160 }}
          />
          <Button
            variant="contained"
            disabled={busy || !invoiceAmount.trim()}
            onClick={() =>
              void runLifecycle("create_invoice", {
                amount: invoiceAmount.trim(),
                deliveryId: invoiceDeliveryId || null,
              })
            }
          >
            Raise invoice
          </Button>
        </div>
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
                      onClick={() => void runLifecycle("approve_payment", { paymentId: pay.id })}
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
                    onClick={() => void runLifecycle("mark_payment_paid", { paymentId: pay.id })}
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

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Closure
        </Typography>
        {row.status === "CLOSED" ? (
          <Typography variant="body2">
            Closed{row.closedAt ? ` on ${String(row.closedAt).slice(0, 10)}` : ""}
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
                void runLifecycle("close_procurement", { remarks: closureRemarks || null })
              }
            >
              Close procurement
            </Button>
          </div>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Lifecycle timeline
        </Typography>
        <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 1.5 }}>
          Case {row.procurementNumber}
          {row.title ? ` — ${row.title}` : ""}. Workflow decisions and domain lifecycle audits are
          shown together. History is read-only.
        </Typography>
        {(row.timeline || []).length === 0 ? (
          <Typography sx={adminMutedTextSx}>
            No timeline events yet. Workflow tasks and lifecycle actions (award, delivery, invoice,
            payment, closure) will appear here as they are recorded.
          </Typography>
        ) : (
          <ul className="space-y-2 text-sm">
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
                  {a.comment ? (
                    <p className="text-xs opacity-80">Comment: {a.comment}</p>
                  ) : null}
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
