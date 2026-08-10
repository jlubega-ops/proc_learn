"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { DEFAULT_CURRENCY } from "@/lib/money";

const BUDGET_LINE_COLUMNS = [
  {
    id: "codeCategory",
    label: "Code / category",
    render: (row) => {
      const category = row.category || row.name || "—";
      const code = row.code ? ` (${row.code})` : "";
      return `${category}${code}`;
    },
  },
  { id: "description", label: "Description" },
  { id: "quantity", label: "Qty", align: "right", money: true },
  {
    id: "unitOfMeasure",
    label: "UoM",
    render: (row) => row.unitOfMeasure || "—",
  },
  { id: "unitCost", label: "Unit cost", align: "right", money: true },
  { id: "approvedAmount", label: "Total", align: "right", money: true },
  {
    id: "fundingSource",
    label: "Funding",
    render: (row) => row.fundingSource || "—",
  },
];

/**
 * Preview / review a single department budget. Reviewers with a pending task
 * can Approve / Return / Reject here (same engine as My Tasks).
 *
 * @param {{ projectId: string; budgetId: string }} p
 */
export function OrgBudgetDetailPanel({ projectId, budgetId }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [budget, setBudget] = useState(/** @type {any} */ (null));
  const [pendingTask, setPendingTask] = useState(/** @type {any} */ (null));
  const [history, setHistory] = useState(/** @type {any[]} */ ([]));
  const [canSubmit, setCanSubmit] = useState(false);
  const [decision, setDecision] = useState("APPROVE");
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budgets/${budgetId}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not load budget.",
          severity: "error",
        });
        setBudget(null);
        return;
      }
      setBudget(data.budget || null);
      setPendingTask(data.pendingTask || null);
      setHistory(Array.isArray(data.workflowHistory) ? data.workflowHistory : []);
      setCanSubmit(Boolean(data.canSubmit));
      setDecision("APPROVE");
      setComment("");
    } finally {
      setLoading(false);
    }
  }, [projectId, budgetId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitBudget() {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budgets/${budgetId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not submit budget.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Budget submitted for review.", severity: "success" });
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
        body: JSON.stringify({
          taskId: pendingTask.id,
          decision,
          comment,
        }),
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

  const statusColor = (s) => {
    if (s === "APPROVED") return "success";
    if (s === "REJECTED" || s === "CLOSED") return "error";
    if (s === "RETURNED" || s === "SUBMITTED" || s === "UNDER_REVIEW") return "warning";
    return "info";
  };

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy>
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  if (!budget) {
    return (
      <Paper variant="outlined" sx={{ p: 3, ...adminOutlinedTableContainerSx }}>
        <Typography sx={adminMutedTextSx}>Budget not found.</Typography>
        <Button
          className="mt-3"
          startIcon={<ArrowBackRounded />}
          onClick={() => router.push(`/projects/${projectId}/budgets`)}
        >
          Back to budgets
        </Button>
      </Paper>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          component={Link}
          href={`/projects/${projectId}/budgets`}
          startIcon={<ArrowBackRounded />}
          variant="outlined"
        >
          Back to budgets
        </Button>
        <Button startIcon={<RefreshRounded />} variant="outlined" onClick={() => load()}>
          Refresh
        </Button>
      </div>

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {budget.title}
            </Typography>
            <Typography variant="body2" sx={adminMutedTextSx}>
              {budget.financialYear?.label || "—"} · {budget.department?.name || "—"}
              {budget.budgetReference ? ` · ${budget.budgetReference}` : ""}
              {" · "}
              {budget.currency || DEFAULT_CURRENCY}
            </Typography>
            <Typography variant="body2" sx={{ ...adminMutedTextSx, mt: 0.5 }}>
              Created by {budget.createdBy?.displayName || "—"}
              {budget.approvedBy?.displayName
                ? ` · Approved by ${budget.approvedBy.displayName}`
                : ""}
            </Typography>
          </div>
          <Chip size="small" color={statusColor(budget.status)} label={budget.status} />
        </div>

        {budget.description ? (
          <Typography variant="body2" className="mt-3 whitespace-pre-wrap">
            {budget.description}
          </Typography>
        ) : null}

        <div className="mt-3">
          <OrgLineItemsTable
            title={`Budget lines (${budget.lines?.length || 0})`}
            columns={BUDGET_LINE_COLUMNS}
            rows={budget.lines || []}
            getRowKey={(row) => row.id}
            emptyMessage="No budget lines."
            footerLabel="Grand total"
            footerTotal={budget.totals?.approvedAmount ?? null}
          />
        </div>

        {canSubmit && (budget.status === "DRAFT" || budget.status === "RETURNED") ? (
          <div className="mt-4">
            <Button
              variant="contained"
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
              disabled={busy}
              onClick={() => void submitBudget()}
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
            Role: {pendingTask.requiredRoleName}. After you approve, the next budgeting step
            (Finance/Budget Officer, then Accounting Officer) receives the task.
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
              color={decision === "REJECT" ? "error" : "primary"}
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
