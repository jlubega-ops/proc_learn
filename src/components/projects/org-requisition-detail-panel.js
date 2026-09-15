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
import { OrgLineItemsTable } from "@/components/projects/org-line-items-table";
import { OrgForm5FillDialog } from "@/components/projects/org-form5-fill-dialog";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { formatMoneyAmount, formatMoneyUGX } from "@/lib/money";
import { format, isValid, parseISO } from "date-fns";
import { workflowDecisionButtonLabel } from "@/lib/projects/workflow-status-presentation";

const REQUISITION_ITEM_COLUMNS = [
  {
    id: "index",
    label: "#",
    align: "right",
    render: (row, index) => row.lineNumber ?? index + 1,
  },
  { id: "itemName", label: "Item" },
  {
    id: "quantity",
    label: "Qty",
    align: "right",
    render: (row) => {
      const qty = formatMoneyAmount(row.quantity);
      const uom = row.unitOfMeasure ? ` ${row.unitOfMeasure}` : "";
      return qty ? `${qty}${uom}` : "—";
    },
  },
  { id: "estimatedUnitPrice", label: "Unit price", align: "right", money: true },
  { id: "estimatedTotal", label: "Line total", align: "right", money: true },
];

/**
 * @param {{ projectId: string; requisitionId: string }} p
 */
export function OrgRequisitionDetailPanel({ projectId, requisitionId }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [row, setRow] = useState(/** @type {any} */ (null));
  const [pendingTask, setPendingTask] = useState(/** @type {any} */ (null));
  const [history, setHistory] = useState(/** @type {any[]} */ ([]));
  const [decision, setDecision] = useState("APPROVE");
  const [comment, setComment] = useState("");
  const [procurementMethod, setProcurementMethod] = useState("");
  const [form5Part, setForm5Part] = useState(/** @type {"I" | "II" | null} */ (null));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/requisitions/${requisitionId}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not load requisition.",
          severity: "error",
        });
        setRow(null);
        return;
      }
      setRow(data.requisition || null);
      setPendingTask(data.pendingTask || null);
      setHistory(Array.isArray(data.history) ? data.history : []);
      const key = String(data.pendingTask?.actionKey || "").toUpperCase();
      setDecision(
        key === "VERIFY"
          ? "VERIFY"
          : key === "SELECT_METHOD"
            ? "SELECT_METHOD"
            : key === "COMPLETE"
              ? "COMPLETE"
              : "APPROVE",
      );
      setComment("");
      setProcurementMethod("");
    } finally {
      setLoading(false);
    }
  }, [projectId, requisitionId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitDecision() {
    if (!pendingTask?.id) return;
    if (decision === "SELECT_METHOD" && !procurementMethod) {
      showToast({ message: "Choose a procurement method.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        taskId: pendingTask.id,
        decision,
        comment,
      };
      if (decision === "SELECT_METHOD") {
        payload.procurementMethod = procurementMethod;
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
    return <Typography sx={adminMutedTextSx}>Requisition not found.</Typography>;
  }

  const actionKey = String(pendingTask?.actionKey || "").toUpperCase();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          component={Link}
          href={`/projects/${projectId}/requisitions`}
          startIcon={<ArrowBackRounded />}
          variant="outlined"
        >
          Back to requisitions
        </Button>
        <Button startIcon={<RefreshRounded />} variant="outlined" onClick={() => load()}>
          Refresh
        </Button>
      </div>

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {row.title}
            </Typography>
            <Typography variant="body2" sx={adminMutedTextSx}>
              {row.financialYear?.label || "—"} · {row.department?.name || "—"}
              {row.requisitionReference ? ` · ${row.requisitionReference}` : ""}
            </Typography>
            <Typography variant="body2" sx={{ ...adminMutedTextSx, mt: 0.5 }}>
              Created by {row.requester?.displayName || "—"}
              {row.requesterRoleName ? ` — ${row.requesterRoleName}` : ""}
              {row.approvedBy?.displayName
                ? ` · Approved by ${row.approvedBy.displayName}${
                    row.approvedByRoleName ? ` — ${row.approvedByRoleName}` : " — Accounting Officer"
                  }`
                : ""}
            </Typography>
          </div>
          <Chip
            size="small"
            color={row.statusColor || (row.status === "APPROVED" ? "success" : "warning")}
            label={row.statusLabel || row.status}
          />
        </div>

        <div className="mt-3 space-y-1 text-sm">
          <p>
            <span className="font-semibold">Plan:</span> {row.procurementPlan?.title || "—"}
          </p>
          <p>
            <span className="font-semibold">Plan item:</span>{" "}
            {row.procurementPlanItem?.title || "—"}
          </p>
          <p>
            <span className="font-semibold">Budget line:</span>{" "}
            {row.budgetLine
              ? `${row.budgetLine.code} — ${row.budgetLine.name} (avail. ${formatMoneyUGX(row.budgetLine.availableBalance)})`
              : "—"}
          </p>
          <p>
            <span className="font-semibold">Estimated total:</span>{" "}
            {formatMoneyUGX(row.estimatedTotalValue)}
          </p>
          <p>
            <span className="font-semibold">Justification:</span> {row.justification}
          </p>
          <p>
            <span className="font-semibold">Need:</span> {row.needDescription}
          </p>
        </div>

        <div className="mt-3">
          <OrgLineItemsTable
            title="Line items"
            columns={REQUISITION_ITEM_COLUMNS}
            rows={row.items || []}
            getRowKey={(item, index) => item.id || item.lineNumber || index}
            emptyMessage="No line items."
            footerLabel="Estimated total"
            footerTotal={row.estimatedTotalValue ?? null}
          />
        </div>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          FORM 5 (teaching)
        </Typography>
        <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
          Fill Part I (User Department request) and Part II (PDU to Contracts Committee) in-app.
          Download from the fill dialog is PDF-only after required fields are complete.
        </Typography>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="contained"
            startIcon={<DescriptionRounded />}
            onClick={() => setForm5Part("I")}
          >
            {row.form5PartI ? "Edit Form 5 Part I" : "Fill Form 5 Part I"}
          </Button>
          <Button
            variant="outlined"
            startIcon={<DescriptionRounded />}
            onClick={() => setForm5Part("II")}
          >
            {row.form5PartII ? "Edit Form 5 Part II" : "Fill Form 5 Part II"}
          </Button>
        </div>
        <div className="mt-2 space-y-1 text-sm">
          <p>
            <span className="font-semibold">Part I:</span>{" "}
            {row.form5PartIAt
              ? `Saved ${formatDateShort(row.form5PartIAt)}`
              : "Not filled yet"}
          </p>
          <p>
            <span className="font-semibold">Part II:</span>{" "}
            {row.form5PartIIAt
              ? `Saved ${formatDateShort(row.form5PartIIAt)}`
              : "Not filled yet"}
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
            {actionKey ? ` · ${actionKey}` : ""}. Flow: HOD → Procurement Officer (plan) → Head PDU
            (funding) → Accounting Officer.
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
              {actionKey === "SELECT_METHOD" ? (
                <MenuItem value="SELECT_METHOD">Select procurement method</MenuItem>
              ) : null}
              {actionKey === "VERIFY" ? <MenuItem value="VERIFY">Verify</MenuItem> : null}
              {actionKey !== "VERIFY" && actionKey !== "SELECT_METHOD" ? (
                <MenuItem value="APPROVE">Approve</MenuItem>
              ) : null}
              {actionKey !== "SELECT_METHOD" ? (
                <MenuItem value="RETURN">Return for correction</MenuItem>
              ) : null}
              {actionKey !== "SELECT_METHOD" ? <MenuItem value="REJECT">Reject</MenuItem> : null}
              {actionKey === "VERIFY" ? (
                <MenuItem value="FLAG_EXCEPTION">Flag exception</MenuItem>
              ) : null}
            </TextField>
            {decision === "SELECT_METHOD" ? (
              <TextField
                select
                label="Procurement method"
                value={procurementMethod}
                onChange={(e) => setProcurementMethod(e.target.value)}
                fullWidth
                required
                sx={themedTextFieldSx}
                helperText="Choose Micro, Quotation, or Tender. Recording this decision creates a Procurement record and starts that method’s workflow."
              >
                <MenuItem value="">Select a method</MenuItem>
                <MenuItem value="MICRO">Micro Procurement</MenuItem>
                <MenuItem value="QUOTATION">Quotation</MenuItem>
                <MenuItem value="TENDER">Tender</MenuItem>
              </TextField>
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
              color={decision === "REJECT" || decision === "FLAG_EXCEPTION" ? "error" : "primary"}
              disabled={busy}
              onClick={() => void submitDecision()}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {workflowDecisionButtonLabel(decision, { busy })}
            </Button>
          </div>
        </Paper>
      ) : null}

      {history.length > 0 ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Workflow history
          </Typography>
          <ul className="space-y-1 text-sm">
            {history.map((h) => (
              <li key={h.id}>
                {String(h.createdAt).slice(0, 19).replace("T", " ")} · {h.actorRoleName || "—"} ·{" "}
                {h.decision}
                {h.comment ? ` — ${h.comment}` : ""}
              </li>
            ))}
          </ul>
        </Paper>
      ) : null}

      {form5Part ? (
        <OrgForm5FillDialog
          open
          part={form5Part}
          projectId={projectId}
          requisition={row}
          onClose={() => setForm5Part(null)}
          onSaved={(next) => {
            if (next) setRow(next);
            else void load();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * @param {unknown} value
 */
function formatDateShort(value) {
  if (!value) return "—";
  const raw = String(value);
  const d = raw.includes("T") ? parseISO(raw) : new Date(raw);
  if (!isValid(d)) return raw.slice(0, 10);
  return format(d, "MMM d, yyyy");
}
