"use client";

import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { formatPrintDate } from "@/components/print/print-document";
import { adminMutedTextSx } from "@/lib/admin-mui-surfaces";
import { formatMoneyUGX } from "@/lib/money";
import { actingRoleLabel } from "@/lib/projects/committee-labels";
import { procurementTaskStage } from "@/lib/projects/procurement-task-stage";
import { workflowDecisionPastLabel } from "@/lib/projects/workflow-status-presentation";

const DECISION_COLOR = { APPROVE: "success", RETURN: "warning", REJECT: "error" };

/**
 * Latest decision on each award workflow step, oldest first.
 * @param {any[]} timeline
 */
function awardStepDecisions(timeline) {
  /** @type {Map<string, any>} */
  const byStep = new Map();
  const sorted = [...(timeline || [])]
    .filter((a) => a.source === "workflow" && a.decision && a.taskTitle)
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  for (const a of sorted) {
    if (procurementTaskStage(a.taskTitle) !== "award") continue;
    const step = String(a.taskTitle).split(":")[0].trim();
    byStep.delete(step);
    byStep.set(step, a);
  }
  return [...byStep.entries()].map(([step, a]) => ({ step, a }));
}

/**
 * Latest approval on the "Approve award" step.
 * @param {any[] | null | undefined} timeline
 */
export function awardApprovalAction(timeline) {
  return (
    awardStepDecisions(timeline || [])
      .map(({ a }) => a)
      .reverse()
      .find((a) => a.decision === "APPROVE" && /^approve award/i.test(String(a.taskTitle || ""))) || null
  );
}

/**
 * @param {string} label
 * @param {import("react").ReactNode} value
 */
function fact(label, value) {
  return (
    <div className="min-w-0">
      <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
        {label}
      </Typography>
      {value}
    </div>
  );
}

/**
 * Decisions on the award steps so far (prepared, reviewed, approved).
 * @param {{ timeline: any[] | null | undefined }} p
 */
export function OrgAwardDecisionTrail({ timeline }) {
  const decisions = awardStepDecisions(timeline || []);
  if (!decisions.length) return null;
  return (
    <ul className="divide-y divide-(--border-subtle) rounded-lg border border-(--border-subtle) text-sm">
      {decisions.map(({ step, a }) => (
        <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
          <div className="min-w-0">
            <p className="font-semibold">{step}</p>
            <p className="wrap-break-word">
              {a.actor?.displayName || "—"}
              {actingRoleLabel(a) ? (
                <Typography component="span" variant="caption" sx={{ ...adminMutedTextSx, ml: 0.75 }}>
                  {actingRoleLabel(a)}
                </Typography>
              ) : null}
            </p>
            {a.comment ? <p className="wrap-break-word opacity-80">{a.comment}</p> : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Chip
              size="small"
              color={/** @type {any} */ (DECISION_COLOR[a.decision] || "info")}
              label={workflowDecisionPastLabel(a.decision)}
            />
            <Typography variant="caption" sx={adminMutedTextSx}>
              {formatPrintDate(a.createdAt)}
            </Typography>
          </div>
        </li>
      ))}
    </ul>
  );
}

export const AWARD_STATUS_PRESENTATION = {
  DRAFT: { label: "Draft", color: "warning" },
  APPROVED: { label: "Approved", color: "info" },
  COMMUNICATED: { label: "Awaiting supplier acceptance", color: "warning" },
  ACCEPTED: { label: "Accepted by supplier", color: "success" },
  DECLINED: { label: "Declined by supplier", color: "error" },
  CANCELLED: { label: "Cancelled", color: "error" },
};

/**
 * Approved award: the decision, who gets notified, and the decisions behind it.
 * @param {{ row: any }} p
 */
export function OrgAwardDetails({ row }) {
  const award = row.award;
  if (!award) return null;
  const approval = awardApprovalAction(row.timeline);
  const notified = award.status !== "APPROVED";
  /** @type {Map<string, string>} */
  const bidders = new Map();
  for (const o of row.offers || []) {
    if (o.supplierId && !bidders.has(o.supplierId)) bidders.set(o.supplierId, o.supplier?.name || "—");
  }
  const unsuccessful = [...bidders.entries()].filter(([id]) => id !== award.supplierId);

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 rounded-lg border border-(--border-subtle) p-3 sm:grid-cols-3">
        {fact("Awarded to", <span className="font-semibold wrap-break-word">{award.supplier?.name || "—"}</span>)}
        {fact("Amount", <span className="font-semibold">{formatMoneyUGX(award.awardedAmount)}</span>)}
        {fact(
          "Status",
          <Chip
            size="small"
            color={/** @type {any} */ (AWARD_STATUS_PRESENTATION[award.status]?.color || "info")}
            label={AWARD_STATUS_PRESENTATION[award.status]?.label || award.status}
          />,
        )}
        {fact(
          "Approved by",
          <span className="wrap-break-word">
            {award.approvedBy?.displayName || "—"}
            {actingRoleLabel(approval) ? (
              <Typography component="span" variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                {actingRoleLabel(approval)}
              </Typography>
            ) : null}
          </span>,
        )}
        {fact("Award date", formatPrintDate(award.awardDate) || "—")}
        {fact("Approval reference", <span className="wrap-break-word">{award.approvalReference || "—"}</span>)}
        {award.communicatedAt ? fact("Communicated on", formatPrintDate(award.communicatedAt)) : null}
      </div>

      {award.status === "COMMUNICATED" ? (
        <Alert severity="warning" variant="outlined">
          Waiting for {award.supplier?.name || "the supplier"} to accept the award in the provider portal.
        </Alert>
      ) : null}
      {award.acceptedAt ? (
        <div className="grid gap-3 rounded-lg border border-(--border-subtle) p-3 sm:grid-cols-3">
          {fact("Accepted by", <span className="wrap-break-word">{award.acceptedByName || "—"}</span>)}
          {fact("For", <span className="wrap-break-word">{award.supplier?.name || "—"}</span>)}
          {fact("Accepted on", formatPrintDate(award.acceptedAt))}
        </div>
      ) : null}
      {award.declinedAt ? (
        <Alert severity="error" variant="outlined">
          {award.supplier?.name || "The supplier"} declined the award on {formatPrintDate(award.declinedAt)}
          {award.declineReason ? `: ${award.declineReason}` : "."}
        </Alert>
      ) : null}

      <div className="rounded-lg border border-(--border-subtle) p-3">
        <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block", mb: 1 }}>
          {notified ? "Bidders notified" : "Bidders to notify"}
        </Typography>
        <ul className="space-y-1">
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="wrap-break-word font-semibold">{award.supplier?.name || "—"}</span>
            <Chip size="small" color="success" variant="outlined" label="Award notice" />
          </li>
          {unsuccessful.map(([id, name]) => (
            <li key={id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="wrap-break-word">{name}</span>
              <Chip size="small" color="warning" variant="outlined" label="Unsuccessful notice" />
            </li>
          ))}
        </ul>
      </div>

      <OrgAwardDecisionTrail timeline={row.timeline} />
    </div>
  );
}

/**
 * What the LPO / contract will be raised from: the accepted award and the winning bid's priced lines.
 * @param {{ row: any }} p
 */
export function OrgAwardOrderBasis({ row }) {
  const award = row.award;
  if (!award) return null;
  const offer =
    (row.offers || [])
      .filter((o) => o.supplierId === award.supplierId && !["WITHDRAWN", "LATE"].includes(o.status))
      .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")))[0] || null;
  const lines = Array.isArray(offer?.lineItems) ? offer.lineItems : [];
  const status = AWARD_STATUS_PRESENTATION[award.status];

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 rounded-lg border border-(--border-subtle) p-3 sm:grid-cols-3">
        {fact("Supplier", <span className="font-semibold wrap-break-word">{award.supplier?.name || "—"}</span>)}
        {fact("Value", <span className="font-semibold">{formatMoneyUGX(award.awardedAmount)}</span>)}
        {fact(
          "Award",
          <Chip size="small" color={/** @type {any} */ (status?.color || "info")} label={status?.label || award.status} />,
        )}
        {award.acceptedAt
          ? fact(
              "Accepted by",
              <span className="wrap-break-word">
                {award.acceptedByName || "—"} · {formatPrintDate(award.acceptedAt)}
              </span>,
            )
          : null}
        {fact("Delivery period", offer?.deliveryDays ? `${offer.deliveryDays} days` : "—")}
        {fact("Deliver to", <span className="wrap-break-word">{row.requisition?.deliveryLocation || "—"}</span>)}
      </div>

      {award.status === "COMMUNICATED" ? (
        <Alert severity="warning" variant="outlined">
          Waiting for {award.supplier?.name || "the supplier"} to accept the award in the provider portal.
        </Alert>
      ) : null}
      {award.declinedAt ? (
        <Alert severity="error" variant="outlined">
          {award.supplier?.name || "The supplier"} declined the award on {formatPrintDate(award.declinedAt)}
          {award.declineReason ? `: ${award.declineReason}` : "."}
        </Alert>
      ) : null}

      {lines.length ? (
        <div className="overflow-x-auto rounded-lg border border-(--border-subtle)">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-(--border-subtle) text-left text-xs uppercase opacity-70">
                <th className="p-2">Item</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">Unit price</th>
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.lineNumber || i} className="border-b border-(--border-subtle)">
                  <td className="p-2 wrap-break-word">{l.itemName}</td>
                  <td className="p-2 text-right">
                    {l.quantity}
                    {l.unitOfMeasure ? <span className="text-xs opacity-70"> {l.unitOfMeasure}</span> : null}
                  </td>
                  <td className="p-2 text-right">{formatMoneyUGX(l.unitPrice)}</td>
                  <td className="p-2 text-right">{formatMoneyUGX(l.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="p-2 text-right font-semibold">
                  Total
                </td>
                <td className="p-2 text-right font-semibold">{formatMoneyUGX(award.awardedAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Award recommendation before the award exists: basis and decisions so far.
 * @param {{ row: any }} p
 */
export function OrgAwardRecommendationSummary({ row }) {
  const report = (row.evaluationReports || []).find((r) => r.status === "APPROVED") || null;

  if (!report) {
    return (
      <Typography variant="body2" sx={adminMutedTextSx}>
        Awaiting approved evaluation report.
      </Typography>
    );
  }

  const estimate = Number(row.requisition?.estimatedTotalValue) || 0;
  const price = Number(report.evaluatedAmount) || 0;
  const variance = price - estimate;

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 rounded-lg border border-(--border-subtle) p-3 sm:grid-cols-3">
        {fact(
          "Recommended bidder",
          <span className="font-semibold wrap-break-word">{report.recommendedSupplier?.name || "—"}</span>,
        )}
        {fact("Contract price", <span className="font-semibold">{formatMoneyUGX(price)}</span>)}
        {fact(
          "Against estimate",
          estimate ? (
            <Chip
              size="small"
              color={variance > 0 ? "error" : "success"}
              label={
                variance > 0
                  ? `Over by ${formatMoneyUGX(variance)}`
                  : `Within · saves ${formatMoneyUGX(-variance)}`
              }
            />
          ) : (
            "—"
          ),
        )}
        {fact("Estimated value", formatMoneyUGX(estimate))}
        {fact("Evaluation report", report.approvedAt ? `Approved ${formatPrintDate(report.approvedAt)}` : "Approved")}
        {fact("Evaluation committee", report.committee?.name || "—")}
        {report.recommendation ? (
          <div className="sm:col-span-3">
            {fact("Recommendation", <p className="wrap-break-word">{report.recommendation}</p>)}
          </div>
        ) : null}
      </div>

      <OrgAwardDecisionTrail timeline={row.timeline} />

      {row.stageLabel ? (
        <div className="flex flex-wrap items-center gap-2">
          <Typography variant="caption" sx={adminMutedTextSx}>
            Next
          </Typography>
          <Chip size="small" color="warning" label={row.stageLabel} />
        </div>
      ) : null}
    </div>
  );
}
