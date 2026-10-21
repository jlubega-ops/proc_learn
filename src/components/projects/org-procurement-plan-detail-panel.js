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
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { useRouter } from "next/navigation";
import {
  PrintButton,
  PrintDocument,
  formatPrintDate,
  formatPrintDateTime,
} from "@/components/print/print-document";
import { OrgLineItemsTable } from "@/components/projects/org-line-items-table";
import { RecordDetailsGrid, recordPersonLine } from "@/components/projects/record-details-grid";
import { WorkflowHistoryPanel } from "@/components/projects/workflow-history-panel";
import { useToast } from "@/components/providers/toast-provider";
import { decisionConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { useDraftSync } from "@/hooks/use-draft-sync";
import { notifyOrgTasksChanged } from "@/hooks/use-pending-task-counts";
import { useProcessActivation } from "@/hooks/use-process-activation";
import { ProcessGateTooltip } from "@/components/projects/process-gate";
import { PROCESS_FLOW_CODES } from "@/lib/projects/process-catalogue";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { DEFAULT_CURRENCY, formatMoneyAmount, formatMoneyUGX } from "@/lib/money";
import {
  defaultWorkflowDecision,
  workflowDecisionHelp,
  workflowDecisionOptions,
} from "@/lib/projects/workflow-decision-options";
import { workflowDecisionButtonLabel } from "@/lib/projects/workflow-status-presentation";
import { finalApproverRoleLabel } from "@/lib/projects/committee-labels";

const SHEET_LABELS = {
  CONSULTANCY: "Consultancy services",
  GOODS_WORKS_NON_CONSULTANCY: "Goods, works and non-consultancy services",
};

/** @param {any} row */
function planItemFunding(row) {
  return row.circularFields?.sourceOfFunding || "—";
}

/** @param {any} row */
function planItemMethod(row) {
  return row.circularFields?.plannedProcurementMethod || null;
}

/** @param {any} row */
function planItemContractType(row) {
  return row.circularFields?.contractType || null;
}

/**
 * Milestone dates for print — omit blanks.
 * @param {any} item
 * @param {number} index
 */
function planItemMilestonePrintSection(item, index) {
  const cf = item?.circularFields || {};
  /** @type {{ label: string; key: string }[]} */
  const candidates = [
    { label: "Bid invitation date", key: "bidInvitationDate" },
    { label: "Bid closing / opening", key: "bidClosingOpeningDate" },
    { label: "Eval report approval", key: "evaluationReportApprovalDate" },
    { label: "Award decision", key: "awardDecisionDate" },
    { label: "BEB / award notice", key: "awardNotificationDate" },
    { label: "EOI invitation", key: "eoiInvitationDate" },
    { label: "EOI closing / opening", key: "eoiClosingOpeningDate" },
    { label: "Shortlist approval", key: "eoiShortlistApprovalDate" },
    { label: "Proposal notification", key: "proposalNotificationDate" },
    { label: "Proposal deadline", key: "proposalDeadlineDate" },
    { label: "Proposal opening", key: "proposalOpeningDate" },
    { label: "Proposal eval approval", key: "proposalEvalApprovalDate" },
    { label: "Proposal award notification", key: "proposalAwardNotificationDate" },
    { label: "Contract signing", key: "contractSigningDate" },
    { label: "Completion date", key: "completionDate" },
  ];
  const fields = candidates
    .filter((c) => cf[c.key])
    .map((c) => ({
      label: c.label,
      value: formatPrintDate(cf[c.key]),
    }));
  if (!fields.length) return null;
  return {
    type: "fields",
    title: `Item ${index + 1} milestones: ${item.title || "Plan item"}`,
    fields,
  };
}

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
    label: "Circular sheet",
    render: (row) => row.circularFields?.circularSheet || row.category || "—",
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
    id: "sourceOfFunding",
    label: "Source of funding",
    render: planItemFunding,
  },
  {
    id: "method",
    label: "Method",
    render: (row) => planItemMethod(row) || "—",
  },
  {
    id: "budgetLine",
    label: "Budget line",
    render: (row) => (row.budgetLine?.code ? row.budgetLine.code : "—"),
  },
];

/**
 * @param {any} plan
 */
function planPrintSections(plan) {
  const currency = plan.items?.[0]?.circularFields?.currency || DEFAULT_CURRENCY;
  const dept = plan.department;
  const period = plan.planningPeriod;
  /** @type {any[]} */
  const sections = [
    {
      type: "fields",
      title: "Section A: Plan details",
      fields: [
        { label: "Plan title", value: plan.title, full: true },
        { label: "Reference", value: plan.planReference },
        { label: "Financial year", value: plan.financialYear?.label },
        {
          label: "Department",
          value: dept ? `${dept.name}${dept.code ? ` (${dept.code})` : ""}` : null,
        },
        { label: "Plan type", value: plan.isEmergency ? "Emergency plan" : "Annual plan" },
        ...(plan.emergencyJustification
          ? [{ label: "Emergency justification", value: plan.emergencyJustification, full: true }]
          : []),
        {
          label: "Planning period",
          value:
            period?.startDate && period?.endDate
              ? `${formatPrintDate(period.startDate)} – ${formatPrintDate(period.endDate)}`
              : null,
        },
        { label: "Currency", value: currency },
        { label: "Current stage", value: plan.stageLabel || plan.status },
        { label: "Number of items", value: String(plan.totals?.itemCount ?? 0) },
        { label: "Created on", value: formatPrintDateTime(plan.createdAt) },
        {
          label: "Submitted on",
          value: plan.submittedAt ? formatPrintDateTime(plan.submittedAt) : null,
        },
        {
          label: "Prepared by",
          value: plan.createdBy
            ? `${plan.createdBy.displayName}${plan.createdBy.roleName ? ` — ${plan.createdBy.roleName}` : ""}`
            : null,
        },
        {
          label: "Approved by",
          value: plan.approvedBy
            ? `${plan.approvedBy.displayName}${plan.approvedAt ? `, ${formatPrintDate(plan.approvedAt)}` : ""}`
            : null,
        },
      ],
    },
    {
      type: "table",
      title: "Section B: Plan items",
      columns: [
        { id: "no", label: "No.", width: "5%" },
        { id: "item", label: "Item" },
        { id: "sheet", label: "Circular sheet" },
        { id: "quantity", label: "Qty", align: "right" },
        { id: "unit", label: "Unit" },
        { id: "unitPrice", label: `Unit price (${currency})`, align: "right" },
        { id: "total", label: `Total (${currency})`, align: "right" },
        { id: "funding", label: "Source of funding" },
        { id: "method", label: "Procurement method" },
        { id: "contractType", label: "Contract type" },
        { id: "completion", label: "Completion date" },
        { id: "budgetLine", label: "Budget line" },
        { id: "period", label: "Period" },
      ],
      rows: (plan.items || []).map((item, idx) => ({
        key: item.id,
        note: item.description,
        cells: {
          no: `${idx + 1}.`,
          item: item.title || "—",
          sheet:
            item.circularFields?.circularSheet ||
            item.category ||
            SHEET_LABELS[item.circularFields?.sheetType] ||
            SHEET_LABELS[plan.sheetType] ||
            "—",
          quantity: formatMoneyAmount(item.quantity) || "—",
          unit: item.unitOfMeasure || "—",
          unitPrice: formatMoneyAmount(item.estimatedUnitPrice) || "—",
          total: formatMoneyAmount(item.estimatedTotal) || "—",
          funding: planItemFunding(item),
          method: planItemMethod(item) || "—",
          contractType: planItemContractType(item) || "—",
          completion: item.circularFields?.completionDate
            ? formatPrintDate(item.circularFields.completionDate)
            : "—",
          budgetLine: item.budgetLine?.code || "—",
          period: item.expectedProcurementPeriod || "—",
        },
      })),
      empty: "No plan items.",
      footer: { label: "Grand total", value: formatMoneyUGX(plan.totals?.estimatedTotal) },
    },
  ];

  for (let i = 0; i < (plan.items || []).length; i += 1) {
    const milestone = planItemMilestonePrintSection(plan.items[i], i);
    if (milestone) sections.push(milestone);
  }

  return sections;
}

/**
 * @param {{ plan: any }} p
 */
function PlanDetailsGrid({ plan }) {
  const dept = plan.department;
  const period = plan.planningPeriod;
  const fields = [
    { label: "Financial year", value: plan.financialYear?.label },
    {
      label: "Department",
      value: dept ? `${dept.name}${dept.code ? ` (${dept.code})` : ""}` : null,
    },
    { label: "Current stage", value: plan.stageLabel || plan.status },
    { label: "Circular sheet", value: SHEET_LABELS[plan.sheetType] || plan.sheetType, wide: true },
    {
      label: "Planning period",
      value:
        period?.startDate && period?.endDate
          ? `${formatPrintDate(period.startDate)} – ${formatPrintDate(period.endDate)}`
          : null,
    },
    { label: "Currency", value: plan.items?.[0]?.circularFields?.currency || DEFAULT_CURRENCY },
    { label: "Items", value: String(plan.totals?.itemCount ?? plan.items?.length ?? 0) },
    { label: "Estimated total", value: formatMoneyUGX(plan.totals?.estimatedTotal) },
    { label: "Created on", value: plan.createdAt ? formatPrintDate(plan.createdAt) : null },
    { label: "Submitted on", value: plan.submittedAt ? formatPrintDate(plan.submittedAt) : null },
    { label: "Prepared by", value: recordPersonLine(plan.createdBy), wide: true },
    { label: "Approved by", value: recordPersonLine(plan.approvedBy, plan.approvedAt), wide: true },
    ...(plan.emergencyJustification
      ? [{ label: "Emergency justification", value: plan.emergencyJustification, wide: true }]
      : []),
  ];

  return <RecordDetailsGrid fields={fields} />;
}

/**
 * @param {{ projectId: string; planId: string }} p
 */
export function OrgProcurementPlanDetailPanel({ projectId, planId }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(/** @type {any} */ (null));
  const [pendingTask, setPendingTask] = useState(/** @type {any} */ (null));
  const [history, setHistory] = useState(/** @type {any[]} */ ([]));
  const [canSubmit, setCanSubmit] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [organisation, setOrganisation] = useState(/** @type {any} */ (null));
  const [printedBy, setPrintedBy] = useState(/** @type {any} */ (null));
  const [decision, setDecision] = useState("APPROVE");
  const [comment, setComment] = useState("");
  const decisionDraft = useDraftSync(
    `org:plan:${planId}:task:${pendingTask?.id || ""}:decision`,
    { decision, comment },
    (d) => {
      if (typeof d.decision === "string") setDecision(d.decision);
      if (typeof d.comment === "string") setComment(d.comment);
    },
    { enabled: Boolean(pendingTask?.id) && !loading },
  );
  const processes = useProcessActivation(projectId);
  const planCode = plan?.isEmergency
    ? PROCESS_FLOW_CODES.EMERGENCY_PLANNING
    : PROCESS_FLOW_CODES.PROCUREMENT_PLANNING;
  const planProcessOff = !processes.isActive(planCode);

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
      setCanEdit(Boolean(data.canEdit));
      setCanDelete(Boolean(data.canDelete));
      setOrganisation(data.organisation || null);
      setPrintedBy(data.printedBy || null);
      const key = String(data.pendingTask?.actionKey || "").toUpperCase();
      setDecision(defaultWorkflowDecision(key));
      setComment("");
    } finally {
      setLoading(false);
    }
  }, [projectId, planId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitPlan() {
    if (!(await confirm(decisionConfirmOptions("SUBMIT", "this plan for review")))) return;
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
      notifyOrgTasksChanged(projectId);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deletePlan() {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/procurement-plans/${planId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not delete plan.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Procurement plan deleted.", severity: "success" });
      setDeleteOpen(false);
      notifyOrgTasksChanged(projectId);
      router.push(`/projects/${projectId}/procurement-plans`);
    } finally {
      setBusy(false);
    }
  }

  async function submitDecision() {
    if (!pendingTask?.id) return;
    if (!(await confirm(decisionConfirmOptions(decision, "this plan")))) return;
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
      decisionDraft.clearDraft();
      notifyOrgTasksChanged(projectId);
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
        <div className="flex flex-wrap gap-2">
          <PrintButton fileName={`Procurement plan ${plan.planReference || plan.title}`} />
          <Button startIcon={<RefreshRounded />} variant="outlined" onClick={() => load()}>
            Refresh
          </Button>
        </div>
      </div>

      <PrintDocument
        documentTitle={plan.isEmergency ? "Emergency procurement plan" : "Procurement plan"}
        reference={plan.planReference}
        status={plan.stageLabel || plan.status}
        organisation={organisation}
        sections={planPrintSections(plan)}
        signatures={[
          {
            label: "Prepared by",
            name: plan.createdBy?.displayName,
            role: plan.createdBy?.roleName,
            date: plan.submittedAt || plan.createdAt,
          },
          {
            label: "Approved by",
            name: plan.approvedBy?.displayName,
            role: finalApproverRoleLabel(history, plan.approvedBy?.roleName),
            date: plan.approvedAt,
          },
        ]}
        printedBy={printedBy}
      />

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {plan.title}
            </Typography>
            {plan.planReference ? (
              <Typography variant="body2" sx={adminMutedTextSx}>
                {plan.planReference}
              </Typography>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1">
            {plan.isEmergency ? (
              <Chip size="small" color="warning" label="Emergency plan" />
            ) : (
              <Chip size="small" color="info" label="Annual plan" />
            )}
            <Chip
              size="small"
              color={plan.statusColor || (plan.status === "APPROVED" ? "success" : "warning")}
              label={plan.statusLabel || plan.status}
            />
          </div>
        </div>

        <PlanDetailsGrid plan={plan} />

        <div className="mt-3">
          <OrgLineItemsTable
            title={`Plan items (${plan.items?.length || 0})`}
            columns={PLAN_ITEM_COLUMNS}
            rows={plan.items || []}
            getRowKey={(row) => row.id}
            getRowNote={(row) => row.description}
            emptyMessage="No plan items."
            footerLabel="Grand total"
            footerTotal={plan.totals?.estimatedTotal ?? null}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {canEdit ? (
            <Button
              component={Link}
              href={`/projects/${projectId}/procurement-plans/${planId}/edit`}
              variant="outlined"
              startIcon={<EditRounded />}
            >
              Edit
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteOutlineRounded />}
              disabled={busy}
              onClick={() => setDeleteOpen(true)}
            >
              Delete
            </Button>
          ) : null}
          {canSubmit && (plan.status === "DRAFT" || plan.status === "RETURNED") ? (
            <ProcessGateTooltip inactive={planProcessOff} title={processes.inactiveTitle(planCode)}>
              <Button
                variant="contained"
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
                disabled={busy || planProcessOff}
                onClick={() => void submitPlan()}
              >
                Submit for review
              </Button>
            </ProcessGateTooltip>
          ) : null}
        </div>
      </Paper>

      {pendingTask ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Review task: {pendingTask.title}
          </Typography>
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
            Role: {pendingTask.requiredRoleName}. Flow:{" "}
            {plan.isEmergency
              ? "HOD → Head PDU → Accounting Officer (emergency)."
              : "HOD → Head PDU → Contracts Officer → Accounting Officer."}
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
              {workflowDecisionOptions(actionKey, {
                isEmergencyPlan: Boolean(plan.isEmergency),
              }).map((opt) => (
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
        <DialogTitle>Delete plan?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This permanently removes &ldquo;{plan.title}&rdquo;. Only drafts can be deleted.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void deletePlan()}
            disabled={busy}
          >
            {busy ? <CircularProgress size={22} color="inherit" /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
