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
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import { useRouter } from "next/navigation";
import { OrgLineItemsTable } from "@/components/projects/org-line-items-table";
import { WorkflowHistoryPanel } from "@/components/projects/workflow-history-panel";
import { RecordDetailsGrid, recordPersonLine } from "@/components/projects/record-details-grid";
import {
  PrintButton,
  PrintDocument,
  formatPrintDate,
  formatPrintDateTime,
} from "@/components/print/print-document";
import { useToast } from "@/components/providers/toast-provider";
import { notifyOrgTasksChanged } from "@/hooks/use-pending-task-counts";
import {
  adminCenteredLoadingBoxSx,
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
import {
  workflowDecisionButtonLabel,
  workflowDecisionPastLabel,
} from "@/lib/projects/workflow-status-presentation";
import { providerTerm } from "@/lib/projects/provider-terms";
import {
  OrgMethodEligibility,
  methodAllowedForValue,
} from "@/components/projects/org-method-eligibility";
import {
  OrgProviderSelection,
  OrgProviderShortlistSummary,
} from "@/components/projects/org-provider-selection";
import Alert from "@mui/material/Alert";

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

const METHOD_LABELS = {
  MICRO: "Micro Procurement",
  QUOTATION: "Quotation",
  TENDER: "Tender",
};

/** @param {any} row */
function deptLabel(row) {
  const d = row.department;
  return d ? `${d.name}${d.code ? ` (${d.code})` : ""}` : null;
}

/** @param {any} row */
function planLabel(row) {
  const p = row.procurementPlan;
  return p ? `${p.title}${p.planReference ? ` · ${p.planReference}` : ""}` : null;
}

/** @param {any} row */
function budgetLineLabel(row) {
  const b = row.budgetLine;
  return b ? [b.code, b.name].filter(Boolean).join(" — ") : null;
}

/** @param {any} row */
function requisitionDetailFields(row) {
  const fields = [
    { label: "Financial year", value: row.financialYear?.label },
    { label: "Department", value: deptLabel(row) },
    { label: "Current stage", value: row.stageLabel || row.statusLabel || row.status, wide: true },
    { label: "Category", value: row.category },
    { label: "Procurement method", value: METHOD_LABELS[row.procurementMethod] || row.procurementMethod },
    { label: "Required by", value: row.requiredByDate ? formatPrintDate(row.requiredByDate) : null },
    { label: "Items", value: String(row.items?.length || 0) },
    { label: "Procurement plan", value: planLabel(row), wide: true },
    { label: "Plan item", value: row.procurementPlanItem?.title, wide: true },
    { label: "Budget line", value: budgetLineLabel(row), wide: true },
    {
      label: "Available on line",
      value: row.budgetLine ? formatMoneyUGX(row.budgetLine.availableBalance) : null,
    },
    { label: "Estimated total", value: formatMoneyUGX(row.estimatedTotalValue) },
    { label: "Delivery location", value: row.deliveryLocation, wide: true },
    { label: "Created on", value: row.createdAt ? formatPrintDate(row.createdAt) : null },
    { label: "Submitted on", value: row.submittedAt ? formatPrintDate(row.submittedAt) : null },
    { label: "Requested by", value: recordPersonLine(row.requester), wide: true },
    { label: "Approved by", value: recordPersonLine(row.approvedBy, row.approvedAt), wide: true },
    { label: "Justification", value: row.justification, full: true },
    { label: "Need", value: row.needDescription, full: true },
  ];
  if (row.remarks) fields.push({ label: "Remarks", value: row.remarks, full: true });
  return fields;
}

/**
 * @param {any} row
 * @param {any[]} history
 */
function requisitionPrintSections(row, history) {
  const partI = row.form5PartI && typeof row.form5PartI === "object" ? row.form5PartI : {};
  const shortlist = Array.isArray(row.form5PartII?.shortlist) ? row.form5PartII.shortlist : [];
  /** @type {any[]} */
  const sections = [
    {
      type: "fields",
      title: "Section A: Requisition details",
      fields: [
        { label: "Subject of procurement", value: row.title, full: true },
        { label: "Reference", value: row.requisitionReference },
        { label: "Financial year", value: row.financialYear?.label },
        { label: "Department", value: deptLabel(row) },
        { label: "Category", value: row.category },
        { label: "Current stage", value: row.stageLabel || row.statusLabel || row.status },
        {
          label: "Procurement method",
          value: METHOD_LABELS[row.procurementMethod] || row.procurementMethod,
        },
        { label: "Required by", value: row.requiredByDate ? formatPrintDate(row.requiredByDate) : null },
        { label: "Delivery location", value: row.deliveryLocation },
        { label: "Procurement plan", value: planLabel(row), full: true },
        { label: "Plan item", value: row.procurementPlanItem?.title, full: true },
        { label: "Created on", value: formatPrintDateTime(row.createdAt) },
        { label: "Submitted on", value: row.submittedAt ? formatPrintDateTime(row.submittedAt) : null },
        { label: "Justification", value: row.justification, full: true },
        { label: "Description of need", value: row.needDescription, full: true },
      ],
    },
    {
      type: "fields",
      title: "Section B: Funds availability",
      fields: [
        { label: "Vote / head no.", value: partI.voteHeadNo },
        { label: "Programme", value: partI.programme },
        { label: "Sub-programme", value: partI.subProgramme },
        { label: "Funding item", value: partI.fundingItem || budgetLineLabel(row) },
        { label: "Estimated total cost", value: formatMoneyUGX(row.estimatedTotalValue) },
        { label: "Market price", value: partI.marketPrice ? formatMoneyUGX(partI.marketPrice) : null },
        {
          label: "Balance remaining",
          value: partI.balanceRemaining ? formatMoneyUGX(partI.balanceRemaining) : null,
        },
        { label: "Multi-year contracting", value: partI.multiYearContracting },
      ],
    },
    {
      type: "table",
      title: "Section C: Items",
      columns: [
        { id: "no", label: "No.", width: "5%" },
        { id: "item", label: "Item" },
        { id: "quantity", label: "Qty", align: "right" },
        { id: "unit", label: "Unit" },
        { id: "unitPrice", label: "Unit price (UGX)", align: "right" },
        { id: "total", label: "Total (UGX)", align: "right" },
      ],
      rows: (row.items || []).map((item, idx) => ({
        key: item.id || idx,
        note: [item.description, item.specification].filter(Boolean).join(" — ") || null,
        cells: {
          no: `${idx + 1}.`,
          item: item.itemName || "—",
          quantity: formatMoneyAmount(item.quantity) || "—",
          unit: item.unitOfMeasure || "—",
          unitPrice: formatMoneyAmount(item.estimatedUnitPrice) || "—",
          total: formatMoneyAmount(item.estimatedTotal) || "—",
        },
      })),
      empty: "No items.",
      footer: { label: "Estimated total", value: formatMoneyUGX(row.estimatedTotalValue) },
    },
  ];
  if (shortlist.length) {
    sections.push({
      type: "table",
      title: `Section D: Shortlisted ${providerTerm(row.category, { plural: true })}`,
      columns: [
        { id: "no", label: "No.", width: "5%" },
        { id: "name", label: providerTerm(row.category, { capitalize: true }) },
        { id: "checks", label: "Qualification" },
      ],
      rows: shortlist.map((s, idx) => ({
        key: s.id || idx,
        cells: {
          no: `${idx + 1}.`,
          name: s.name || "—",
          checks: s.qualifies ? "Passed" : (s.failedReasons || []).join("; ") || "Warnings",
        },
      })),
      empty: "None.",
    });
  }
  sections.push({
    type: "table",
    title: `Section ${shortlist.length ? "E" : "D"}: Approval trail`,
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
  });
  return sections;
}

/**
 * @param {{ projectId: string; requisitionId: string }} p
 */
export function OrgRequisitionDetailPanel({ projectId, requisitionId }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [row, setRow] = useState(/** @type {any} */ (null));
  const [pendingTask, setPendingTask] = useState(/** @type {any} */ (null));
  const [blockedTask, setBlockedTask] = useState(/** @type {any} */ (null));
  const [history, setHistory] = useState(/** @type {any[]} */ ([]));
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [decision, setDecision] = useState("APPROVE");
  const [comment, setComment] = useState("");
  const [procurementMethod, setProcurementMethod] = useState("");
  const [organisation, setOrganisation] = useState({ name: "", code: null });
  const [printedBy, setPrintedBy] = useState(/** @type {any} */ (null));
  const [form5PartII, setForm5PartII] = useState(/** @type {Record<string, string>} */ ({}));
  const [shortlistIds, setShortlistIds] = useState(/** @type {string[]} */ ([]));
  const [shortlistConfirmed, setShortlistConfirmed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const providerWord = providerTerm(row?.category);
  const providerWordPlural = providerTerm(row?.category, { plural: true });

  const methodBlockReason = (() => {
    if (decision !== "SELECT_METHOD") return "";
    if (!procurementMethod) return "Choose a method.";
    if (!methodAllowedForValue(procurementMethod, row?.estimatedTotalValue)) {
      return "This value is above the limit for the chosen method.";
    }
    if (procurementMethod === "QUOTATION" && !shortlistIds.length) {
      return `Shortlist ${providerWordPlural} first.`;
    }
    if (procurementMethod !== "TENDER" && shortlistIds.length && !shortlistConfirmed) {
      return procurementMethod === "MICRO"
        ? `Run validation and select the ${providerWord}, or clear it.`
        : "Run validation and confirm the shortlist.";
    }
    return "";
  })();

  const changeMethod = (next) => {
    setProcurementMethod(next);
    setShortlistConfirmed(false);
    setFieldErrors((e) => ({ ...e, shortlistedProviderIds: "", shortlistJustification: "" }));
    if (next === "TENDER") setShortlistIds([]);
    else if (next === "MICRO") setShortlistIds((ids) => ids.slice(0, 1));
  };

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
        setCanEdit(false);
        setCanDelete(false);
        return;
      }
      setRow(data.requisition || null);
      setCanEdit(Boolean(data.canEdit));
      setCanDelete(Boolean(data.canDelete));
      setOrganisation(data.organisation || { name: "", code: null });
      setPrintedBy(data.printedBy || null);
      setPendingTask(data.pendingTask || null);
      setBlockedTask(data.blockedTask || null);
      setHistory(Array.isArray(data.history) ? data.history : []);
      const key = String(data.pendingTask?.actionKey || "").toUpperCase();
      setDecision(defaultWorkflowDecision(key));
      setComment("");
      setProcurementMethod(
        String(data.requisition?.procurementMethod || "").toUpperCase() || "",
      );
      const partII =
        data.requisition?.form5PartII && typeof data.requisition.form5PartII === "object"
          ? data.requisition.form5PartII
          : {};
      const defaultsII = data.form5Defaults?.partII || {};
      const savedShortlist = Array.isArray(partII.shortlist) ? partII.shortlist : [];
      setShortlistIds(savedShortlist.map((s) => s.id).filter(Boolean));
      setShortlistConfirmed(savedShortlist.length > 0);
      setFieldErrors({});
      setForm5PartII({
        methodJustification: partII.methodJustification || "",
        shortlistedProviders: partII.shortlistedProviders || "",
        shortlistJustification: partII.shortlistJustification || "",
        biddingDocumentPreparers:
          partII.biddingDocumentPreparers || defaultsII.biddingDocumentPreparers || "",
        evaluationCommitteeNominees:
          partII.evaluationCommitteeNominees || defaultsII.evaluationCommitteeNominees || "",
        evaluationCommitteeJustification: partII.evaluationCommitteeJustification || "",
        biddingDocumentCost: partII.biddingDocumentCost || "",
        otherInformation: partII.otherInformation || "",
        pduOfficerName: partII.pduOfficerName || defaultsII.pduOfficerName || "",
        pduOfficerPosition:
          partII.pduOfficerPosition || defaultsII.pduOfficerPosition || "Procurement Officer",
        ccChairName: partII.ccChairName || defaultsII.ccChairName || "",
        ccSecretaryName: partII.ccSecretaryName || defaultsII.ccSecretaryName || "",
        dateSubmittedToCc: partII.dateSubmittedToCc || new Date().toISOString().slice(0, 10),
        ccMeetingReference: partII.ccMeetingReference || "",
      });
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
    if (decision === "SELECT_METHOD") {
      /** @type {Record<string, string>} */
      const errs = {};
      if (!String(form5PartII.methodJustification || "").trim()) {
        errs.methodJustification = "Enter the justification for the recommended method.";
      }
      if (!String(form5PartII.pduOfficerName || "").trim()) {
        errs.pduOfficerName = "Enter the PDU officer name.";
      }
      if (procurementMethod === "QUOTATION" && shortlistIds.length === 0) {
        errs.shortlistedProviderIds = `Shortlist at least one ${providerWord}.`;
      } else if (
        procurementMethod !== "TENDER" &&
        shortlistIds.length > 0 &&
        !shortlistConfirmed
      ) {
        errs.shortlistedProviderIds = "Run validation and confirm the selection first.";
      }
      if (
        procurementMethod === "QUOTATION" &&
        shortlistIds.length > 0 &&
        shortlistIds.length < 3 &&
        !String(form5PartII.shortlistJustification || "").trim()
      ) {
        errs.shortlistJustification = `Explain why fewer than three ${providerWordPlural} are shortlisted.`;
      }
      setFieldErrors(errs);
      if (Object.keys(errs).length) {
        showToast({ message: "Please fix the highlighted fields.", severity: "error" });
        return;
      }
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
        payload.form5 = {
          ...form5PartII,
          shortlistedProviderIds: procurementMethod === "TENDER" ? [] : shortlistIds,
        };
      }
      if (String(pendingTask.requiredRoleName || "") === "Contracts Committee") {
        payload.form5 = {
          ccChairName: form5PartII.ccChairName,
          ccSecretaryName: form5PartII.ccSecretaryName,
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
        if (data.fieldErrors && typeof data.fieldErrors === "object") setFieldErrors(data.fieldErrors);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not record decision.",
          severity: "error",
        });
        return;
      }
      const msg = data.awaitingContractsCommittee
        ? "Form 5 Part II submitted. Contracts Committee must approve the method."
        : data.nextProcessStarted
          ? "Method approved. Procurement process started."
          : "Decision recorded.";
      showToast({ message: msg, severity: "success" });
      notifyOrgTasksChanged();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteRequisition() {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/requisitions/${requisitionId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not delete requisition.",
          severity: "error",
        });
        return;
      }
      setDeleteOpen(false);
      showToast({ message: "Requisition deleted.", severity: "success" });
      router.push(`/projects/${projectId}/requisitions`);
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
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button
              component={Link}
              href={`/projects/${projectId}/requisitions/${requisitionId}/edit`}
              startIcon={<EditRounded />}
              variant="outlined"
              color="primary"
              title="Edit requisition"
            >
              Edit
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              startIcon={<DeleteOutlineRounded />}
              variant="outlined"
              color="error"
              onClick={() => setDeleteOpen(true)}
              title="Delete requisition"
            >
              Delete
            </Button>
          ) : null}
          <PrintButton
            fileName={`Requisition ${row.requisitionReference || row.title}`}
          />
          <Button startIcon={<RefreshRounded />} variant="outlined" onClick={() => load()}>
            Refresh
          </Button>
        </div>
      </div>

      <PrintDocument
        documentTitle="Requisition for procurement (PP Form 5)"
        reference={row.requisitionReference}
        status={row.stageLabel || row.statusLabel || row.status}
        organisation={organisation}
        sections={requisitionPrintSections(row, history)}
        signatures={[
          {
            label: "Requested by",
            name: row.requester?.displayName,
            role: row.requester?.roleName,
            date: row.submittedAt || row.createdAt,
          },
          {
            label: "Approved by",
            name: row.approvedBy?.displayName,
            role: row.approvedBy?.roleName,
            date: row.approvedAt,
          },
        ]}
        printedBy={printedBy}
      />

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {row.title}
            </Typography>
            {row.requisitionReference ? (
              <Typography variant="body2" sx={adminMutedTextSx}>
                {row.requisitionReference}
              </Typography>
            ) : null}
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
            <Chip
              size="small"
              color={row.statusColor || (row.status === "APPROVED" ? "success" : "warning")}
              label={row.statusLabel || row.status}
            />
          </div>
        </div>

        <RecordDetailsGrid fields={requisitionDetailFields(row)} />

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

        {pendingTask?.requiredRoleName !== "Contracts Committee" &&
        Array.isArray(row.form5PartII?.shortlist) &&
        row.form5PartII.shortlist.length ? (
          <div className="mt-3">
            <OrgProviderShortlistSummary
              shortlist={row.form5PartII.shortlist}
              category={row.category}
              justification={row.form5PartII?.shortlistJustification}
            />
          </div>
        ) : null}
      </Paper>

      {blockedTask ? (
        <Alert severity="warning">
          <strong>Task waiting in another role:</strong> {blockedTask.title}. {blockedTask.message}
        </Alert>
      ) : null}

      {pendingTask ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            {pendingTask.title}
          </Typography>
          {decision === "SELECT_METHOD" || pendingTask.requiredRoleName === "Contracts Committee" ? (
            <div className="mb-3">
              <OrgMethodEligibility
                requisition={row}
                selecting={decision === "SELECT_METHOD"}
                selectedMethod={procurementMethod}
              />
            </div>
          ) : null}
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
                includeFlagException: actionKey === "VERIFY",
              }).map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {workflowDecisionLabelForTask(opt, pendingTask.title)}
                </MenuItem>
              ))}
            </TextField>

            {actionKey === "SELECT_METHOD" || decision === "SELECT_METHOD" ? (
              <>
                <TextField
                  select
                  label="Recommended method"
                  value={procurementMethod}
                  onChange={(e) => changeMethod(e.target.value)}
                  fullWidth
                  sx={themedTextFieldSx}
                  error={Boolean(fieldErrors.procurementMethod)}
                  helperText={fieldErrors.procurementMethod || " "}
                >
                  <MenuItem value="">Select a method</MenuItem>
                  {[
                    ["MICRO", "Micro Procurement"],
                    ["QUOTATION", "Quotation"],
                    ["TENDER", "Tender"],
                  ].map(([value, label]) => {
                    const allowed = methodAllowedForValue(value, row.estimatedTotalValue);
                    return (
                      <MenuItem key={value} value={value} disabled={!allowed}>
                        {label}
                        {allowed ? "" : " — above limit"}
                      </MenuItem>
                    );
                  })}
                </TextField>
                <TextField
                  label="Method justification"
                  value={form5PartII.methodJustification || ""}
                  onChange={(e) =>
                    setForm5PartII((f) => ({ ...f, methodJustification: e.target.value }))
                  }
                  fullWidth
                  multiline
                  minRows={2}
                  className="sm:col-span-2"
                  sx={themedTextFieldSx}
                  error={Boolean(fieldErrors.methodJustification)}
                  helperText={fieldErrors.methodJustification || " "}
                />
                <div className="sm:col-span-2">
                  {procurementMethod === "TENDER" ? (
                    <Typography variant="body2" sx={adminMutedTextSx}>
                      Open tender — advertised, no shortlist.
                    </Typography>
                  ) : procurementMethod === "MICRO" || procurementMethod === "QUOTATION" ? (
                    <OrgProviderSelection
                      projectId={projectId}
                      mode={procurementMethod === "MICRO" ? "single" : "multi"}
                      method={procurementMethod}
                      category={row.category}
                      value={shortlistIds}
                      onChange={(ids) => {
                        setShortlistIds(ids);
                        setShortlistConfirmed(false);
                        setFieldErrors((e) => ({ ...e, shortlistedProviderIds: "" }));
                      }}
                      actionLabel={
                        procurementMethod === "MICRO"
                          ? `Select ${providerWord}`
                          : "Shortlist"
                      }
                      confirmed={shortlistConfirmed}
                      confirmedLabel={
                        procurementMethod === "MICRO"
                          ? `${providerTerm(row.category, { capitalize: true })} selected`
                          : `${shortlistIds.length} shortlisted`
                      }
                      onUnconfirm={() => setShortlistConfirmed(false)}
                      onConfirm={() => {
                        setShortlistConfirmed(true);
                        setFieldErrors((e) => ({ ...e, shortlistedProviderIds: "" }));
                      }}
                      extraWarnings={
                        procurementMethod === "QUOTATION" &&
                        shortlistIds.length > 0 &&
                        shortlistIds.length < 3
                          ? [
                              `Fewer than three ${providerWordPlural} — add a justification.`,
                            ]
                          : []
                      }
                      error={fieldErrors.shortlistedProviderIds}
                      label={
                        procurementMethod === "MICRO"
                          ? `${providerTerm(row.category, { capitalize: true })} (optional)`
                          : `Shortlist ${providerWordPlural}`
                      }
                      helperText=""
                    />
                  ) : null}
                </div>
                {procurementMethod === "QUOTATION" &&
                shortlistIds.length > 0 &&
                shortlistIds.length < 3 ? (
                  <TextField
                    label="Justification for fewer than three"
                    value={form5PartII.shortlistJustification || ""}
                    onChange={(e) =>
                      setForm5PartII((f) => ({ ...f, shortlistJustification: e.target.value }))
                    }
                    fullWidth
                    multiline
                    minRows={2}
                    className="sm:col-span-2"
                    sx={themedTextFieldSx}
                    error={Boolean(fieldErrors.shortlistJustification)}
                    helperText={fieldErrors.shortlistJustification || " "}
                  />
                ) : null}
                <TextField
                  label="PDU officer"
                  error={Boolean(fieldErrors.pduOfficerName)}
                  helperText={fieldErrors.pduOfficerName || " "}
                  value={form5PartII.pduOfficerName || ""}
                  onChange={(e) =>
                    setForm5PartII((f) => ({ ...f, pduOfficerName: e.target.value }))
                  }
                  fullWidth
                  sx={themedTextFieldSx}
                />
                <TextField
                  label="PDU position"
                  value={form5PartII.pduOfficerPosition || ""}
                  onChange={(e) =>
                    setForm5PartII((f) => ({ ...f, pduOfficerPosition: e.target.value }))
                  }
                  fullWidth
                  sx={themedTextFieldSx}
                />
                <TextField
                  label="Evaluation committee nominees"
                  value={form5PartII.evaluationCommitteeNominees || ""}
                  onChange={(e) =>
                    setForm5PartII((f) => ({
                      ...f,
                      evaluationCommitteeNominees: e.target.value,
                    }))
                  }
                  fullWidth
                  className="sm:col-span-2"
                  sx={themedTextFieldSx}
                />
                <TextField
                  label="CC Chair"
                  value={form5PartII.ccChairName || ""}
                  InputProps={{ readOnly: true }}
                  fullWidth
                  sx={themedTextFieldSx}
                />
                <TextField
                  label="CC Secretary"
                  value={form5PartII.ccSecretaryName || ""}
                  InputProps={{ readOnly: true }}
                  fullWidth
                  sx={themedTextFieldSx}
                />
              </>
            ) : null}

            {pendingTask.requiredRoleName === "Contracts Committee" ? (
              <>
                <TextField
                  label="Recommended method"
                  value={row.procurementMethod || "—"}
                  InputProps={{ readOnly: true }}
                  fullWidth
                  sx={themedTextFieldSx}
                />
                <TextField
                  label="Method justification"
                  value={row.form5PartII?.methodJustification || "—"}
                  InputProps={{ readOnly: true }}
                  fullWidth
                  multiline
                  minRows={2}
                  className="sm:col-span-2"
                  sx={themedTextFieldSx}
                />
                <div className="sm:col-span-2">
                  {row.procurementMethod === "TENDER" ? (
                    <Typography variant="body2" sx={adminMutedTextSx}>
                      Open tender — advertised, no shortlist.
                    </Typography>
                  ) : Array.isArray(row.form5PartII?.shortlist) &&
                    row.form5PartII.shortlist.length ? (
                    <OrgProviderShortlistSummary
                      shortlist={row.form5PartII.shortlist}
                      category={row.category}
                      justification={row.form5PartII?.shortlistJustification}
                    />
                  ) : (
                    <Typography variant="body2" sx={adminMutedTextSx}>
                      No {providerWord} shortlisted on Form 5 Part II.
                    </Typography>
                  )}
                </div>
                <TextField
                  label="CC Chair"
                  value={form5PartII.ccChairName || ""}
                  InputProps={{ readOnly: true }}
                  fullWidth
                  sx={themedTextFieldSx}
                />
                <TextField
                  label="CC Secretary"
                  value={form5PartII.ccSecretaryName || ""}
                  InputProps={{ readOnly: true }}
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Tooltip title={methodBlockReason || ""}>
              <span>
                <Button
                  variant="contained"
                  color={decision === "REJECT" || decision === "FLAG_EXCEPTION" ? "error" : "primary"}
                  disabled={busy || Boolean(methodBlockReason)}
                  onClick={() => void submitDecision()}
                  startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
                >
                  {!busy && isPositiveWorkflowDecision(decision) && workflowStepActionLabel(pendingTask.title)
                    ? workflowStepActionLabel(pendingTask.title)
                    : workflowDecisionButtonLabel(decision, { busy })}
                </Button>
              </span>
            </Tooltip>
            {methodBlockReason ? (
              <Typography variant="caption" sx={adminMutedTextSx} role="status">
                {methodBlockReason}
              </Typography>
            ) : null}
          </div>
        </Paper>
      ) : null}

      <WorkflowHistoryPanel history={history} showStatusChange />

      <Dialog
        open={deleteOpen}
        onClose={() => !busy && setDeleteOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Delete requisition?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This removes <strong>{row.title}</strong>
            {row.status === "SUBMITTED"
              ? " and cancels the pending Head of User Department review task."
              : "."}{" "}
            This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy}
            onClick={() => void deleteRequisition()}
            startIcon={
              busy ? <CircularProgress size={16} color="inherit" /> : <DeleteOutlineRounded />
            }
          >
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}