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
import { decisionConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { useDraftSync } from "@/hooks/use-draft-sync";
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
import {
  actingRoleLabel,
  committeeSeatLabel,
  finalApprovalEntry,
  finalApproverRoleLabel,
  isCommitteeAction,
} from "@/lib/projects/committee-labels";
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
import { minRfqProviders } from "@/lib/projects/procurement-thresholds";
import { useProcessActivation } from "@/hooks/use-process-activation";
import { processCodesForMethod } from "@/lib/projects/process-catalogue";

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

/**
 * @param {any} row
 * @param {any[]} history
 */
function requisitionDetailFields(row, history) {
  const endorsed = stepSignOff(history, ENDORSE_STEP_RE);
  return [
    { label: "Current stage", value: row.stageLabel || row.statusLabel || row.status, wide: true },
    { label: "Financial year", value: row.financialYear?.label },
    { label: "Department", value: deptLabel(row) },
    { label: "Category", value: row.category },
    { label: "Required by", value: row.requiredByDate ? formatPrintDate(row.requiredByDate) : null },
    ...(row.procurementMethod
      ? [{ label: "Procurement method", value: METHOD_LABELS[row.procurementMethod] || row.procurementMethod }]
      : []),
    { label: "Delivery location", value: row.deliveryLocation, wide: true },
    { label: "Requested by", value: recordPersonLine(row.requester, row.submittedAt || row.createdAt), wide: true },
    ...(endorsed ? [{ label: "Endorsed by", value: signOffLine(endorsed), wide: true }] : []),
    ...(row.approvedBy
      ? [{ label: "Approved by", value: recordPersonLine(row.approvedBy, row.approvedAt), wide: true }]
      : []),
  ];
}

const ENDORSE_STEP_RE = /^review requisition/i;
const PLAN_STEP_RE = /^verify procurement plan/i;
const FUNDING_STEP_RE = /^verify funding/i;

/**
 * Latest forward decision on a requisition step, e.g. who verified funding.
 * @param {any[]} history
 * @param {RegExp} re
 */
function stepSignOff(history, re) {
  return (
    [...(history || [])]
      .filter(
        (h) =>
          h.decision &&
          !["RETURN", "REJECT"].includes(h.decision) &&
          re.test(String(h.taskTitle || "").split(":")[0].trim()),
      )
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0] || null
  );
}

/**
 * @param {any} h
 */
function signOffLine(h) {
  return h ? `${h.actorName || "—"}${h.actorRoleName ? ` · ${h.actorRoleName}` : ""} · ${formatPrintDate(h.createdAt)}` : null;
}

/**
 * Form 5 Part II as submitted by the Procurement Officer.
 * @param {any} row
 * @param {{ ccChairName?: string, ccSecretaryName?: string }} [cc]
 */
function methodRecommendationFields(row, cc = {}) {
  const p = {
    ...(row.form5PartII && typeof row.form5PartII === "object" ? row.form5PartII : {}),
    ...(cc.ccChairName ? { ccChairName: cc.ccChairName } : {}),
    ...(cc.ccSecretaryName ? { ccSecretaryName: cc.ccSecretaryName } : {}),
  };
  const recommendedBy = [p.pduOfficerName, p.pduOfficerPosition].filter(Boolean).join(" · ");
  return [
    { label: "Recommended method", value: METHOD_LABELS[row.procurementMethod] || row.procurementMethod || null },
    {
      label: "Recommended by",
      value: recommendedBy
        ? `${recommendedBy}${p.dateSubmittedToCc ? ` · ${formatPrintDate(p.dateSubmittedToCc)}` : ""}`
        : null,
    },
    ...(row.isEmergency
      ? [{ label: "Emergency reasons", value: p.emergencyReasons || row.procurementPlan?.emergencyJustification || null, full: true }]
      : []),
    { label: "Method justification", value: p.methodJustification || null, full: true },
    { label: "Bidding document preparers", value: p.biddingDocumentPreparers || null },
    { label: "Evaluation committee nominees", value: p.evaluationCommitteeNominees || null },
    ...(row.procurementMethod === "TENDER" && p.biddingDocumentCost
      ? [{ label: "Bidding document cost", value: formatMoneyUGX(p.biddingDocumentCost) }]
      : []),
    { label: "CC chairperson", value: p.ccChairName || null },
    { label: "CC secretary", value: p.ccSecretaryName || null },
    ...(p.otherInformation ? [{ label: "Other information", value: p.otherInformation, full: true }] : []),
  ];
}

/**
 * @param {number | null | undefined} qty
 * @param {string | null | undefined} unit
 */
function qtyLabel(qty, unit) {
  return `${formatMoneyAmount(qty) || "0"}${unit ? ` ${unit}` : ""}`;
}

/** @param {any} row */
function planCheckResult(row) {
  const c = row.planCheck;
  if (!c) return null;
  const overQty = c.remainingQuantity < -0.009;
  const overValue = c.remainingPlannedValue < -0.5;
  return overQty || overValue
    ? { label: overQty ? "Exceeds planned quantity" : "Exceeds planned value", color: "error" }
    : { label: "Within plan", color: "success" };
}

/**
 * @param {any} row
 * @param {any[]} history
 */
function requisitionPlanFields(row, history) {
  const verified = stepSignOff(history, PLAN_STEP_RE);
  const c = row.planCheck;
  const unit = row.procurementPlanItem?.unitOfMeasure;
  const result = planCheckResult(row);
  return [
    { label: "Procurement plan", value: planLabel(row), wide: true },
    { label: "Plan item", value: row.procurementPlanItem?.title, wide: true },
    ...(c
      ? [
          { label: "Planned", value: `${qtyLabel(c.plannedQuantity, unit)} · ${formatMoneyUGX(c.plannedAmount)}` },
          {
            label: "Other requisitions",
            value: `${qtyLabel(c.otherConsumedQuantity, unit)} · ${formatMoneyUGX(c.otherConsumedValue)}`,
          },
          {
            label: "This requisition",
            value: `${qtyLabel(c.requisitionQuantity, unit)} · ${formatMoneyUGX(c.requisitionAmount)}`,
          },
          {
            label: "Remaining on plan",
            value: (
              <span className="inline-flex flex-wrap items-center gap-1">
                {`${qtyLabel(c.remainingQuantity, unit)} · ${formatMoneyUGX(c.remainingPlannedValue)}`}
                {result ? <Chip size="small" color={/** @type {any} */ (result.color)} label={result.label} /> : null}
              </span>
            ),
          },
        ]
      : []),
    ...(verified ? [{ label: "Verified by", value: signOffLine(verified), wide: true }] : []),
  ];
}

/**
 * @param {any} row
 * @param {any[]} history
 */
function requisitionFundingFields(row, history) {
  const verified = stepSignOff(history, FUNDING_STEP_RE);
  const b = row.budgetLine;
  return [
    { label: "Budget line", value: budgetLineLabel(row), wide: true },
    ...(b
      ? [
          { label: "Approved on line", value: formatMoneyUGX(b.approvedAmount) },
          { label: b.selfCommitted ? "Committed by others" : "Committed", value: formatMoneyUGX(b.committedAmount) },
        ]
      : []),
    { label: "Available on line", value: b ? formatMoneyUGX(b.availableBalance) : null },
    {
      label: b?.selfCommitted ? "This requisition (committed)" : "This requisition",
      value: formatMoneyUGX(row.estimatedTotalValue),
    },
    ...(b
      ? [
          {
            label: "Balance after",
            value: (
              <span className="inline-flex flex-wrap items-center gap-1">
                {formatMoneyUGX(b.projectedBalance)}
                <Chip
                  size="small"
                  color={b.selfCommitted || b.sufficient ? "success" : "error"}
                  label={b.selfCommitted ? "Funds committed" : b.sufficient ? "Funds available" : "Insufficient funds"}
                />
              </span>
            ),
            wide: true,
          },
        ]
      : []),
    ...(verified ? [{ label: "Verified by", value: signOffLine(verified), wide: true }] : []),
  ];
}

/** @param {any} row */
function requisitionNeedFields(row) {
  return [
    { label: "Justification", value: row.justification, full: true },
    { label: "Need", value: row.needDescription, full: true },
    ...(row.remarks ? [{ label: "Remarks", value: row.remarks, full: true }] : []),
  ];
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
        ...(row.planCheck
          ? [
              {
                label: "Planned",
                value: `${qtyLabel(row.planCheck.plannedQuantity, row.procurementPlanItem?.unitOfMeasure)} · ${formatMoneyUGX(row.planCheck.plannedAmount)}`,
              },
              {
                label: "Remaining on plan",
                value: `${qtyLabel(row.planCheck.remainingQuantity, row.procurementPlanItem?.unitOfMeasure)} · ${formatMoneyUGX(row.planCheck.remainingPlannedValue)} (${planCheckResult(row)?.label})`,
              },
            ]
          : []),
        {
          label: "Requested by",
          value: [row.requester?.displayName, row.requester?.roleName].filter(Boolean).join(", ") || null,
        },
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
        ...(row.budgetLine
          ? [
              { label: "Approved on line", value: formatMoneyUGX(row.budgetLine.approvedAmount) },
              {
                label: row.budgetLine.selfCommitted ? "Committed by others" : "Committed",
                value: formatMoneyUGX(row.budgetLine.committedAmount),
              },
            ]
          : []),
        {
          label: "Available on line",
          value: row.budgetLine ? formatMoneyUGX(row.budgetLine.availableBalance) : null,
        },
        { label: "Estimated total cost", value: formatMoneyUGX(row.estimatedTotalValue) },
        ...(partI.marketPrice ? [{ label: "Market price", value: formatMoneyUGX(partI.marketPrice) }] : []),
        {
          label: "Balance remaining",
          value: partI.balanceRemaining
            ? formatMoneyUGX(partI.balanceRemaining)
            : row.budgetLine
              ? formatMoneyUGX(row.budgetLine.projectedBalance)
              : null,
        },
        {
          label: "Funds",
          value: row.budgetLine
            ? row.budgetLine.selfCommitted
              ? "Committed"
              : row.budgetLine.sufficient
                ? "Available"
                : "Insufficient"
            : null,
        },
        ...(partI.multiYearContracting ? [{ label: "Multi-year contracting", value: partI.multiYearContracting }] : []),
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
    if (row.form5PartII?.shortlistJustification) {
      sections.push({
        type: "fields",
        title: "Shortlist justification",
        fields: [
          {
            label: row.isEmergency ? "Fewer than two" : "Fewer than three",
            value: row.form5PartII.shortlistJustification,
            full: true,
          },
        ],
      });
    }
  }
  const partII = row.form5PartII && typeof row.form5PartII === "object" ? row.form5PartII : {};
  const committeeActions = latestCommitteeDecisions(history);
  if (partII.methodJustification || partII.ccChairName || partII.ccSecretaryName || committeeActions.length) {
    sections.push({
      type: "fields",
      title: "Section E: Procurement method approval",
      fields: [
        {
          label: "Procurement method",
          value: METHOD_LABELS[row.procurementMethod] || row.procurementMethod,
        },
        { label: "PDU officer", value: [partII.pduOfficerName, partII.pduOfficerPosition].filter(Boolean).join(", ") || null },
        ...(row.isEmergency
          ? [{ label: "Emergency reasons", value: partII.emergencyReasons || row.procurementPlan?.emergencyJustification, full: true }]
          : []),
        { label: "Method justification", value: partII.methodJustification, full: true },
        { label: "Bidding document preparers", value: partII.biddingDocumentPreparers, full: true },
        { label: "Evaluation committee nominees", value: partII.evaluationCommitteeNominees, full: true },
        ...(partII.biddingDocumentCost
          ? [{ label: "Bidding document cost", value: formatMoneyUGX(partII.biddingDocumentCost) }]
          : []),
        { label: "Date submitted to Contracts Committee", value: partII.dateSubmittedToCc ? formatPrintDate(partII.dateSubmittedToCc) : null },
        { label: "Contracts Committee chairperson", value: partII.ccChairName },
        { label: "Contracts Committee secretary", value: partII.ccSecretaryName },
        ...(partII.otherInformation ? [{ label: "Other information", value: partII.otherInformation, full: true }] : []),
      ],
    });
  }
  if (committeeActions.length) {
    sections.push({
      type: "table",
      title: "Committee decisions",
      columns: [
        { id: "date", label: "Date", width: "16%" },
        { id: "committee", label: "Committee" },
        { id: "decision", label: "Decision", width: "14%" },
        { id: "by", label: "Decided by", width: "20%" },
        { id: "seat", label: "Seat", width: "14%" },
      ],
      rows: committeeActions.map((h) => ({
        key: h.id,
        cells: {
          date: formatPrintDate(h.createdAt),
          committee: h.committeeName || h.stepRoleName || "Committee",
          decision: workflowDecisionPastLabel(h.decision),
          by: h.actorName || "—",
          seat: committeeSeatLabel(h.committeeRole) || "—",
        },
        note: h.comment || null,
      })),
    });
  }
  return sections;
}

/**
 * Latest decision per committee, oldest first.
 * @param {any[]} history
 */
function latestCommitteeDecisions(history) {
  /** @type {Map<string, any>} */
  const byCommittee = new Map();
  const sorted = [...(history || [])]
    .filter((h) => h.decision && isCommitteeAction(h))
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  for (const h of sorted) byCommittee.set(h.committeeId || h.stepRoleName || "committee", h);
  return [...byCommittee.values()];
}

/**
 * @param {any} row
 * @param {any[]} history
 */
function requisitionSignatures(row, history) {
  const finalApproval = finalApprovalEntry(history);
  const out = [
    {
      label: "Requested by",
      name: row.requester?.displayName,
      role: row.requester?.roleName,
      date: row.submittedAt || row.createdAt,
    },
  ];
  for (const [label, re] of /** @type {[string, RegExp][]} */ ([
    ["Endorsed by", ENDORSE_STEP_RE],
    ["Plan availability verified by", PLAN_STEP_RE],
    ["Funds availability verified by", FUNDING_STEP_RE],
  ])) {
    const h = stepSignOff(history, re);
    if (h) out.push({ label, name: h.actorName, role: h.actorRoleName || h.stepRoleName, date: h.createdAt });
  }
  for (const h of latestCommitteeDecisions(history)) {
    if (finalApproval && h.id === finalApproval.id) continue;
    out.push({
      label: `${h.committeeName || h.stepRoleName || "Committee"} — ${workflowDecisionPastLabel(h.decision)}`,
      name: h.actorName,
      role: actingRoleLabel(h),
      date: h.createdAt,
    });
  }
  out.push({
    label: "Approved by",
    name: row.approvedBy?.displayName,
    role: finalApproverRoleLabel(history, row.approvedBy?.roleName),
    date: row.approvedAt,
  });
  return out;
}

/**
 * @param {{ projectId: string; requisitionId: string }} p
 */
export function OrgRequisitionDetailPanel({ projectId, requisitionId }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
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
  const decisionDraft = useDraftSync(
    `org:requisition:${requisitionId}:task:${pendingTask?.id || ""}:decision`,
    { decision, comment, procurementMethod, form5PartII, shortlistIds },
    (d) => {
      if (typeof d.decision === "string") setDecision(d.decision);
      if (typeof d.comment === "string") setComment(d.comment);
      if (typeof d.procurementMethod === "string") setProcurementMethod(d.procurementMethod);
      if (d.form5PartII && typeof d.form5PartII === "object") {
        setForm5PartII((p) => ({ ...p, .../** @type {Record<string, string>} */ (d.form5PartII) }));
      }
      if (Array.isArray(d.shortlistIds)) {
        const ids = /** @type {string[]} */ (d.shortlistIds);
        if (ids.length !== shortlistIds.length || ids.some((id) => !shortlistIds.includes(id))) {
          setShortlistIds(ids);
          setShortlistConfirmed(false);
        }
      }
    },
    { enabled: Boolean(pendingTask?.id) && !loading },
  );
  const providerWord = providerTerm(row?.category);
  const providerWordPlural = providerTerm(row?.category, { plural: true });
  const minShortlist = minRfqProviders(row?.isEmergency);
  const minShortlistWord = minShortlist === 2 ? "two" : "three";
  const processes = useProcessActivation(projectId);
  /** @param {string} m */
  const methodProcessOff = (m) => processCodesForMethod(m).some((c) => !processes.isActive(c));

  const methodBlockReason = (() => {
    if (decision !== "SELECT_METHOD") return "";
    if (!procurementMethod) return "Choose a method.";
    if (methodProcessOff(procurementMethod)) return "A process this method needs is inactive.";
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
        emergencyReasons:
          partII.emergencyReasons || data.requisition?.procurementPlan?.emergencyJustification || "",
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
    if (["RETURN", "REJECT"].includes(decision) && !comment.trim()) {
      setFieldErrors({ comment: "Enter a comment." });
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    if (decision === "SELECT_METHOD" && !procurementMethod) {
      showToast({ message: "Choose a procurement method.", severity: "error" });
      return;
    }
    if (decision === "SELECT_METHOD") {
      /** @type {Record<string, string>} */
      const errs = {};
      if (row?.isEmergency && !String(form5PartII.emergencyReasons || "").trim()) {
        errs.emergencyReasons = "Enter the reasons for the emergency.";
      }
      if (!String(form5PartII.methodJustification || "").trim()) {
        errs.methodJustification = "Enter the justification for the recommended method.";
      }
      const cost = String(form5PartII.biddingDocumentCost || "").replace(/,/g, "").trim();
      if (procurementMethod === "TENDER" && cost && !(Number(cost) >= 0)) {
        errs.biddingDocumentCost = "Enter an amount.";
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
        shortlistIds.length < minShortlist &&
        !String(form5PartII.shortlistJustification || "").trim()
      ) {
        errs.shortlistJustification = `Explain why fewer than ${minShortlistWord} ${providerWordPlural} are shortlisted.`;
      }
      setFieldErrors(errs);
      if (Object.keys(errs).length) {
        showToast({ message: "Please fix the highlighted fields.", severity: "error" });
        return;
      }
    }
    const confirmed = await confirm(
      decisionConfirmOptions(decision, "this requisition", {
        actionLabel: isPositiveWorkflowDecision(decision) ? workflowStepActionLabel(pendingTask.title) : "",
      }),
    );
    if (!confirmed) return;
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
          : isPositiveWorkflowDecision(decision) && /^approve requisition/i.test(pendingTask.title || "")
            ? "Requisition approved. Pending method selection by Procurement Officer."
            : "Decision recorded.";
      showToast({ message: msg, severity: "success" });
      decisionDraft.clearDraft();
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
  const decisionOptions = workflowDecisionOptions(actionKey);

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
        signatures={requisitionSignatures(row, history)}
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

        <RecordDetailsGrid fields={requisitionDetailFields(row, history)} />

        <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 2 }}>
          Justification
        </Typography>
        <RecordDetailsGrid fields={requisitionNeedFields(row)} />

        <div className="mt-3">
          <OrgLineItemsTable
            title="Line items"
            columns={REQUISITION_ITEM_COLUMNS}
            rows={row.items || []}
            getRowKey={(item, index) => item.id || item.lineNumber || index}
            getRowNote={(item) => [item.description, item.specification].filter(Boolean).join(" — ")}
            emptyMessage="No line items."
            footerLabel="Estimated total"
            footerTotal={row.estimatedTotalValue ?? null}
          />
        </div>

        <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 2 }}>
          Plan check
        </Typography>
        <RecordDetailsGrid fields={requisitionPlanFields(row, history)} />

        <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 2 }}>
          Budget check
        </Typography>
        <RecordDetailsGrid fields={requisitionFundingFields(row, history)} />

        {pendingTask?.requiredRoleName !== "Contracts Committee" &&
        Array.isArray(row.form5PartII?.shortlist) &&
        row.form5PartII.shortlist.length ? (
          <div className="mt-3">
            <OrgProviderShortlistSummary
              shortlist={row.form5PartII.shortlist}
              category={row.category}
              justification={row.form5PartII?.shortlistJustification}
              minimum={minShortlist}
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
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {pendingTask.title}
            </Typography>
            {row.isEmergency ? (
              <Chip size="small" color="warning" label="Emergency" title="From an emergency procurement plan" />
            ) : null}
          </div>
          {decision === "SELECT_METHOD" || pendingTask.requiredRoleName === "Contracts Committee" ? (
            <div className="mb-3">
              <OrgMethodEligibility
                requisition={row}
                selecting={decision === "SELECT_METHOD"}
                selectedMethod={procurementMethod}
              />
            </div>
          ) : null}
          {pendingTask.requiredRoleName === "Contracts Committee" ? (
            <div className="mb-3 grid gap-3">
              <div>
                <RecordDetailsGrid
                  fields={methodRecommendationFields(row, {
                    ccChairName: form5PartII.ccChairName,
                    ccSecretaryName: form5PartII.ccSecretaryName,
                  })}
                />
              </div>
              <div>
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
                    minimum={minShortlist}
                  />
                ) : (
                  <Typography variant="body2" sx={adminMutedTextSx}>
                    No {providerWord} shortlisted on Form 5 Part II.
                  </Typography>
                )}
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {decisionOptions.length > 1 ? (
              <TextField
                select
                label="Decision"
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              >
                {decisionOptions.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {workflowDecisionLabelForTask(opt, pendingTask.title)}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}

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
                    const inactive = methodProcessOff(value);
                    return (
                      <MenuItem key={value} value={value} disabled={!allowed || inactive}>
                        {label}
                        {inactive ? " — process inactive" : allowed ? "" : " — above limit"}
                      </MenuItem>
                    );
                  })}
                </TextField>
                {row.isEmergency ? (
                  <TextField
                    label="Emergency reasons"
                    value={form5PartII.emergencyReasons || ""}
                    onChange={(e) => setForm5PartII((f) => ({ ...f, emergencyReasons: e.target.value }))}
                    fullWidth
                    multiline
                    minRows={2}
                    className="sm:col-span-2"
                    sx={themedTextFieldSx}
                    error={Boolean(fieldErrors.emergencyReasons)}
                    helperText={fieldErrors.emergencyReasons || "From the emergency plan; edit if needed"}
                  />
                ) : null}
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
                        shortlistIds.length < minShortlist
                          ? [
                              `Fewer than ${minShortlistWord} ${providerWordPlural} — add a justification.`,
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
                shortlistIds.length < minShortlist ? (
                  <TextField
                    label={`Justification for fewer than ${minShortlistWord}`}
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
                  label="Bidding document preparers"
                  value={form5PartII.biddingDocumentPreparers || ""}
                  onChange={(e) =>
                    setForm5PartII((f) => ({ ...f, biddingDocumentPreparers: e.target.value }))
                  }
                  fullWidth
                  className={procurementMethod === "TENDER" ? "" : "sm:col-span-2"}
                  sx={themedTextFieldSx}
                />
                {procurementMethod === "TENDER" ? (
                  <TextField
                    label="Bidding document cost (UGX)"
                    value={form5PartII.biddingDocumentCost || ""}
                    onChange={(e) => {
                      setForm5PartII((f) => ({ ...f, biddingDocumentCost: e.target.value }));
                      setFieldErrors((fe) => ({ ...fe, biddingDocumentCost: "" }));
                    }}
                    fullWidth
                    sx={themedTextFieldSx}
                    error={Boolean(fieldErrors.biddingDocumentCost)}
                    helperText={fieldErrors.biddingDocumentCost || "Optional"}
                  />
                ) : null}
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
                  placeholder="Not assigned"
                  slotProps={{ input: { readOnly: true }, inputLabel: { shrink: true } }}
                  fullWidth
                  sx={themedTextFieldSx}
                />
                <TextField
                  label="CC Secretary"
                  value={form5PartII.ccSecretaryName || ""}
                  placeholder="Not assigned"
                  slotProps={{ input: { readOnly: true }, inputLabel: { shrink: true } }}
                  fullWidth
                  sx={themedTextFieldSx}
                />
                <TextField
                  label="Other information (optional)"
                  value={form5PartII.otherInformation || ""}
                  onChange={(e) => setForm5PartII((f) => ({ ...f, otherInformation: e.target.value }))}
                  fullWidth
                  multiline
                  minRows={2}
                  className="sm:col-span-2"
                  sx={themedTextFieldSx}
                />
              </>
            ) : null}

            {decision === "SELECT_METHOD" ? null : (
            <TextField
              label={["RETURN", "REJECT"].includes(decision) ? "Comment" : "Comment (optional)"}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setFieldErrors((f) => ({ ...f, comment: "" }));
              }}
              fullWidth
              multiline
              minRows={2}
              className="sm:col-span-2"
              sx={themedTextFieldSx}
              error={Boolean(fieldErrors.comment)}
              helperText={fieldErrors.comment || " "}
            />
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Tooltip title={methodBlockReason || ""}>
              <span>
                <Button
                  variant="contained"
                  color={decision === "REJECT" ? "error" : "primary"}
                  disabled={busy || Boolean(methodBlockReason)}
                  onClick={() => void submitDecision()}
                  startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
                >
                  {!busy && isPositiveWorkflowDecision(decision) && workflowStepActionLabel(pendingTask.title)
                    ? workflowStepActionLabel(pendingTask.title)
                    : !busy && decision === "RETURN"
                      ? workflowDecisionLabelForTask({ value: "RETURN", label: workflowDecisionButtonLabel(decision) }, pendingTask.title)
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