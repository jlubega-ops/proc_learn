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
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import { OrgLineItemsTable } from "@/components/projects/org-line-items-table";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { formatMoneyAmount } from "@/lib/money";

const PLAN_ITEM_COLUMNS = [
  {
    id: "index",
    label: "#",
    align: "right",
    render: (_row, index) => index + 1,
  },
  { id: "title", label: "Title" },
  {
    id: "category",
    label: "Category",
    render: (row) => row.category || "—",
  },
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
  {
    id: "budgetLine",
    label: "Budget line",
    render: (row) => (row.budgetLine?.code ? row.budgetLine.code : "—"),
  },
];

/**
 * @param {{ projectId: string; planId: string }} p
 */
export function OrgProcurementPlanDetailPanel({ projectId, planId }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(/** @type {any} */ (null));
  const [pendingTask, setPendingTask] = useState(/** @type {any} */ (null));
  const [history, setHistory] = useState(/** @type {any[]} */ ([]));
  const [canSubmit, setCanSubmit] = useState(false);
  const [decision, setDecision] = useState("APPROVE");
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/procurement-plans/${planId}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not load plan.",
          severity: "error",
        });
        setPlan(null);
        return;
      }
      setPlan(data.plan || null);
      setPendingTask(data.pendingTask || null);
      setHistory(Array.isArray(data.workflowHistory) ? data.workflowHistory : []);
      setCanSubmit(Boolean(data.canSubmit));
      const key = String(data.pendingTask?.actionKey || "").toUpperCase();
      setDecision(key === "COMPLETE" ? "COMPLETE" : key === "VERIFY" ? "VERIFY" : "APPROVE");
      setComment("");
    } finally {
      setLoading(false);
    }
  }, [projectId, planId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitPlan() {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/procurement-plans/${planId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not submit plan.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Procurement plan submitted for review.", severity: "success" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function submitDecision() {
    if (!pendingTask?.id) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: pendingTask.id, decision, comment }),
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

  if (!plan) {
    return (
      <Typography sx={adminMutedTextSx}>Procurement plan not found.</Typography>
    );
  }

  const actionKey = String(pendingTask?.actionKey || "").toUpperCase();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          component={Link}
          href={`/projects/${projectId}/procurement-plans`}
          startIcon={<ArrowBackRounded />}
          variant="outlined"
        >
          Back to plans
        </Button>
        <Button startIcon={<RefreshRounded />} variant="outlined" onClick={() => load()}>
          Refresh
        </Button>
      </div>

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {plan.title}
            </Typography>
            <Typography variant="body2" sx={adminMutedTextSx}>
              {plan.financialYear?.label || "—"} · {plan.department?.name || "—"}
              {plan.planReference ? ` · ${plan.planReference}` : ""}
            </Typography>
            <Typography variant="body2" sx={{ ...adminMutedTextSx, mt: 0.5 }}>
              Created by {plan.createdBy?.displayName || "—"}
              {plan.approvedBy?.displayName ? ` · Approved by ${plan.approvedBy.displayName}` : ""}
            </Typography>
          </div>
          <Chip
            size="small"
            color={plan.status === "APPROVED" ? "success" : "warning"}
            label={plan.status}
          />
        </div>

        <div className="mt-3">
          <OrgLineItemsTable
            title={`Plan items (${plan.items?.length || 0})`}
            columns={PLAN_ITEM_COLUMNS}
            rows={plan.items || []}
            getRowKey={(row) => row.id}
            emptyMessage="No plan items."
            footerLabel="Grand total"
            footerTotal={plan.totals?.estimatedTotal ?? null}
          />
        </div>

        {canSubmit && (plan.status === "DRAFT" || plan.status === "RETURNED") ? (
          <div className="mt-4">
            <Button
              variant="contained"
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
              disabled={busy}
              onClick={() => void submitPlan()}
            >
              Submit for review
            </Button>
          </div>
        ) : null}
      </Paper>

      {pendingTask ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Review task: {pendingTask.title}
          </Typography>
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
            Role: {pendingTask.requiredRoleName}
            {actionKey ? ` · Action ${actionKey}` : ""}. Flow: HOD → Head PDU → Contracts Officer →
            Accounting Officer.
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
              {actionKey === "COMPLETE" ? (
                <MenuItem value="COMPLETE">Complete consolidation</MenuItem>
              ) : null}
              <MenuItem value="APPROVE">Approve</MenuItem>
              <MenuItem value="RETURN">Return for correction</MenuItem>
              <MenuItem value="REJECT">Reject</MenuItem>
            </TextField>
            <TextField
              label="Comment (optional)"
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
              disabled={busy}
              onClick={() => void submitDecision()}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {busy ? "Saving…" : "Record decision"}
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
                {h.previousStatus || h.newStatus
                  ? ` (${h.previousStatus || "—"} → ${h.newStatus || "—"})`
                  : ""}
                {h.comment ? ` — ${h.comment}` : ""}
              </li>
            ))}
          </ul>
        </Paper>
      ) : null}
    </div>
  );
}
