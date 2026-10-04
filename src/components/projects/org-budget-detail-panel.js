"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import { OrgLineItemsTable } from "@/components/projects/org-line-items-table";
import { WorkflowHistoryPanel } from "@/components/projects/workflow-history-panel";
import { useToast } from "@/components/providers/toast-provider";
import { notifyOrgTasksChanged } from "@/hooks/use-pending-task-counts";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import {
  PrintButton,
  PrintDocument,
  formatPrintDate,
  formatPrintDateTime,
} from "@/components/print/print-document";
import { RecordDetailsGrid, recordPersonLine } from "@/components/projects/record-details-grid";
import { DEFAULT_CURRENCY, formatMoneyAmount, formatMoneyUGX } from "@/lib/money";
import {
  workflowDecisionButtonLabel,
  workflowDecisionPastLabel,
} from "@/lib/projects/workflow-status-presentation";
import {
  workflowDecisionHelp,
  workflowDecisionOptions,
} from "@/lib/projects/workflow-decision-options";

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
  { id: "quantity", label: "Qty", align: "right", money: true },
  {
    id: "unitOfMeasure",
    label: "Unit",
    render: (row) => row.unitOfMeasure || "—",
  },
  { id: "unitCost", label: "Unit cost", align: "right", money: true },
  { id: "approvedAmount", label: "Total", align: "right", money: true },
  {
    id: "fundingSource",
    label: "Source of funding",
    render: (row) => row.fundingSource || "—",
  },
];

/**
 * @param {any} budget
 */
function budgetDetailFields(budget) {
  const dept = budget.department;
  const fields = [
    { label: "Financial year", value: budget.financialYear?.label },
    {
      label: "Department",
      value: dept ? `${dept.name}${dept.code ? ` (${dept.code})` : ""}` : null,
    },
    { label: "Current stage", value: budget.stageLabel || budget.status, wide: true },
    { label: "Currency", value: budget.currency || DEFAULT_CURRENCY },
    { label: "Lines", value: String(budget.totals?.lineCount ?? budget.lines?.length ?? 0) },
    { label: "Grand total", value: formatMoneyUGX(budget.totals?.approvedAmount) },
    { label: "Created on", value: budget.createdAt ? formatPrintDate(budget.createdAt) : null },
    { label: "Submitted on", value: budget.submittedAt ? formatPrintDate(budget.submittedAt) : null },
    { label: "Approved on", value: budget.approvedAt ? formatPrintDate(budget.approvedAt) : null },
    { label: "Prepared by", value: recordPersonLine(budget.createdBy), wide: true },
    { label: "Approved by", value: recordPersonLine(budget.approvedBy), wide: true },
  ];
  if (budget.description) fields.push({ label: "Narrative", value: budget.description, full: true });
  return fields;
}

/**
 * @param {any} budget
 * @param {any[]} history
 */
function budgetPrintSections(budget, history) {
  const currency = budget.currency || DEFAULT_CURRENCY;
  const dept = budget.department;
  return [
    {
      type: "fields",
      title: "Section A: Budget details",
      fields: [
        { label: "Budget title", value: budget.title, full: true },
        { label: "Reference", value: budget.budgetReference },
        { label: "Financial year", value: budget.financialYear?.label },
        {
          label: "Department",
          value: dept ? `${dept.name}${dept.code ? ` (${dept.code})` : ""}` : null,
        },
        { label: "Currency", value: currency },
        { label: "Current stage", value: budget.stageLabel || budget.status },
        { label: "Number of lines", value: String(budget.totals?.lineCount ?? 0) },
        { label: "Created on", value: formatPrintDateTime(budget.createdAt) },
        {
          label: "Submitted on",
          value: budget.submittedAt ? formatPrintDateTime(budget.submittedAt) : null,
        },
        {
          label: "Prepared by",
          value: budget.createdBy
            ? `${budget.createdBy.displayName}${budget.createdBy.roleName ? ` — ${budget.createdBy.roleName}` : ""}`
            : null,
        },
        {
          label: "Approved by",
          value: budget.approvedBy
            ? `${budget.approvedBy.displayName}${budget.approvedAt ? `, ${formatPrintDate(budget.approvedAt)}` : ""}`
            : null,
        },
        { label: "Narrative", value: budget.description, full: true },
      ],
    },
    {
      type: "table",
      title: "Section B: Budget lines",
      columns: [
        { id: "no", label: "No.", width: "5%" },
        { id: "category", label: "Item / category" },
        { id: "quantity", label: "Qty", align: "right" },
        { id: "unit", label: "Unit" },
        { id: "unitCost", label: `Unit cost (${currency})`, align: "right" },
        { id: "total", label: `Total (${currency})`, align: "right" },
        { id: "funding", label: "Source of funding" },
      ],
      rows: (budget.lines || []).map((line, idx) => ({
        key: line.id,
        note: line.description,
        cells: {
          no: `${idx + 1}.`,
          category: `${line.category || line.name || "—"}${line.code ? ` (${line.code})` : ""}`,
          quantity: formatMoneyAmount(line.quantity) || "—",
          unit: line.unitOfMeasure || "—",
          unitCost: formatMoneyAmount(line.unitCost) || "—",
          total: formatMoneyAmount(line.approvedAmount) || "—",
          funding: line.fundingSource || "—",
        },
      })),
      empty: "No budget lines.",
      footer: { label: "Grand total", value: formatMoneyUGX(budget.totals?.approvedAmount) },
    },
    {
      type: "table",
      title: "Section C: Approval trail",
      columns: [
        { id: "no", label: "No.", width: "5%" },
        { id: "date", label: "Date", width: "18%" },
        { id: "action", label: "Action" },
        { id: "by", label: "By" },
        { id: "role", label: "Role" },
        { id: "comment", label: "Comment" },
      ],
      rows: history.map((h, idx) => ({
        key: h.id,
        cells: {
          no: `${idx + 1}.`,
          date: formatPrintDateTime(h.createdAt),
          action: workflowDecisionPastLabel(h.decision),
          by: h.actorName || "—",
          role: h.actorRoleName || "—",
          comment: h.comment || "—",
        },
      })),
      empty: "Not yet submitted for review.",
    },
  ];
}

/**
 * Preview / review a single department budget. Reviewers with a pending task
 * can Approve / Return / Reject here (same engine as My Tasks).
 *
 * `readOnly` (Organization Administrator) hides draft and review actions; `allowClose` keeps the
 * housekeeping close on approved budgets.
 * @param {{ projectId: string; budgetId: string; listHref?: string; readOnly?: boolean; allowClose?: boolean }} p
 */
export function OrgBudgetDetailPanel({ projectId, budgetId, listHref, readOnly = false, allowClose = false }) {
  const { showToast } = useToast();
  const router = useRouter();
  const backHref = listHref || `/projects/${projectId}/budgets`;
  const [closeOpen, setCloseOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [budget, setBudget] = useState(/** @type {any} */ (null));
  const [pendingTask, setPendingTask] = useState(/** @type {any} */ (null));
  const [history, setHistory] = useState(/** @type {any[]} */ ([]));
  const [organisation, setOrganisation] = useState({ name: "", code: null });
  const [printedBy, setPrintedBy] = useState(/** @type {any} */ (null));
  const [canSubmit, setCanSubmit] = useState(false);
  const [canEditDraft, setCanEditDraft] = useState(false);
  const [canDeleteDraft, setCanDeleteDraft] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
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
      setPendingTask(readOnly ? null : data.pendingTask || null);
      setHistory(Array.isArray(data.workflowHistory) ? data.workflowHistory : []);
      setOrganisation(data.organisation || { name: "", code: null });
      setPrintedBy(data.printedBy || null);
      setCanSubmit(!readOnly && Boolean(data.canSubmit));
      setCanEditDraft(!readOnly && Boolean(data.canEditDraft));
      setCanDeleteDraft(!readOnly && Boolean(data.canDeleteDraft));
      setDecision("APPROVE");
      setComment("");
    } finally {
      setLoading(false);
    }
  }, [projectId, budgetId, showToast, readOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function closeBudget() {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budgets/${budgetId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setStatus", status: "CLOSED" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not close budget.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Budget closed.", severity: "success" });
      setCloseOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

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

  async function deleteDraft() {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budgets/${budgetId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not delete budget.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Draft budget deleted.", severity: "success" });
      router.push(backHref);
    } finally {
      setBusy(false);
      setDeleteOpen(false);
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
      notifyOrgTasksChanged();
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

  if (!budget) {
    return (
      <Paper variant="outlined" sx={{ p: 3, ...adminOutlinedTableContainerSx }}>
        <Typography sx={adminMutedTextSx}>Budget not found.</Typography>
        <Button
          className="mt-3"
          startIcon={<ArrowBackRounded />}
          onClick={() => router.push(backHref)}
        >
          Back to budgets
        </Button>
      </Paper>
    );
  }

  const statusLabel = budget.statusLabel || budget.status;
  const statusColor = budget.statusColor || "info";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          component={Link}
          href={backHref}
          startIcon={<ArrowBackRounded />}
          variant="outlined"
        >
          Back to budgets
        </Button>
        <div className="flex flex-wrap gap-2">
          <PrintButton fileName={`Budget ${budget.budgetReference || budget.title}`} />
          <Button startIcon={<RefreshRounded />} variant="outlined" onClick={() => load()}>
            Refresh
          </Button>
        </div>
      </div>

      <PrintDocument
        documentTitle="Department budget"
        reference={budget.budgetReference}
        status={budget.stageLabel || budget.status}
        organisation={organisation}
        sections={budgetPrintSections(budget, history)}
        signatures={[
          {
            label: "Prepared by",
            name: budget.createdBy?.displayName,
            role: budget.createdBy?.roleName,
            date: budget.submittedAt || budget.createdAt,
          },
          {
            label: "Approved by",
            name: budget.approvedBy?.displayName,
            role: budget.approvedBy?.roleName,
            date: budget.approvedAt,
          },
        ]}
        printedBy={printedBy}
      />

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {budget.title}
            </Typography>
            {budget.budgetReference ? (
              <Typography variant="body2" sx={adminMutedTextSx}>
                {budget.budgetReference}
              </Typography>
            ) : null}
          </div>
          <Chip size="small" color={statusColor} label={statusLabel} />
        </div>

        {budget.status === "SUBMITTED" || budget.status === "UNDER_REVIEW" ? (
          <Typography
            variant="body2"
            className="mt-3 rounded-lg border border-brand-yellow/50 bg-[color:var(--brand-yellow)]/10 px-3 py-2"
            role="status"
          >
            {statusLabel}
          </Typography>
        ) : null}

        <RecordDetailsGrid fields={budgetDetailFields(budget)} />

        <div className="mt-3">
          <OrgLineItemsTable
            title={`Budget lines (${budget.lines?.length || 0})`}
            columns={BUDGET_LINE_COLUMNS}
            rows={budget.lines || []}
            getRowKey={(row) => row.id}
            getRowNote={(row) => row.description}
            emptyMessage="No budget lines."
            footerLabel="Grand total"
            footerTotal={budget.totals?.approvedAmount ?? null}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {canEditDraft ? (
            <Button
              component={Link}
              href={`/projects/${projectId}/budgets/${budgetId}/edit`}
              variant="outlined"
              startIcon={<EditRounded />}
            >
              Edit draft
            </Button>
          ) : null}
          {canDeleteDraft ? (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteOutlineRounded />}
              disabled={busy}
              onClick={() => setDeleteOpen(true)}
            >
              Delete draft
            </Button>
          ) : null}
          {canSubmit && (budget.status === "DRAFT" || budget.status === "RETURNED") ? (
            <Button
              variant="contained"
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
              disabled={busy}
              onClick={() => void submitBudget()}
            >
              Submit for review
            </Button>
          ) : null}
          {allowClose && budget.status === "APPROVED" ? (
            <Button
              variant="outlined"
              color="error"
              startIcon={<LockRounded />}
              disabled={busy}
              onClick={() => setCloseOpen(true)}
            >
              Close budget
            </Button>
          ) : null}
        </div>
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
              helperText={workflowDecisionHelp(decision)}
            >
              {workflowDecisionOptions("APPROVE").map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
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
              {workflowDecisionButtonLabel(decision, { busy })}
            </Button>
          </div>
        </Paper>
      ) : null}

      <WorkflowHistoryPanel history={history} showStatusChange />

      <Dialog
        open={deleteOpen}
        onClose={() => !busy && setDeleteOpen(false)}
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Delete draft budget?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This permanently removes &ldquo;{budget.title}&rdquo;. Only unsubmitted drafts can be
            deleted.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void deleteDraft()}
            disabled={busy}
          >
            {busy ? <CircularProgress size={22} color="inherit" /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={closeOpen}
        onClose={() => !busy && setCloseOpen(false)}
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Close budget?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            &ldquo;{budget.title}&rdquo; can no longer fund new plans or requisitions.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={() => void closeBudget()} disabled={busy}>
            {busy ? <CircularProgress size={22} color="inherit" /> : "Close budget"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
