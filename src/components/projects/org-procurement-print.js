"use client";

import { PrintDocument, formatPrintDate } from "@/components/print/print-document";
import { formatMoneyUGX } from "@/lib/money";
import { describeProcurementStage } from "@/lib/projects/procurement-stage-status";
import {
  procurementStageLabel,
  procurementStagesForMethod,
  procurementTaskStage,
} from "@/lib/projects/procurement-task-stage";
import { workflowDecisionPastLabel } from "@/lib/projects/workflow-status-presentation";
import { actingRoleLabel, committeeSeatLabel, isCommitteeAction } from "@/lib/projects/committee-labels";
import { AWARD_STATUS_PRESENTATION } from "@/components/projects/org-award-recommendation-summary";

/** @typedef {import("@/components/print/print-document").PrintSection} PrintSection */

const METHOD_LABELS = { MICRO: "Micro procurement", QUOTATION: "Request for quotations", TENDER: "Tender" };

/** @param {unknown} v */
function human(v) {
  const s = String(v || "").replace(/_/g, " ").toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : "—";
}

/** @param {any} row */
function detailFields(row) {
  const req = row.requisition;
  const dept = row.department;
  return [
    { label: "Procurement no.", value: row.procurementNumber },
    { label: "Method", value: METHOD_LABELS[row.procurementMethod] || row.procurementMethod },
    { label: "Subject", value: row.title, full: true },
    { label: "Requisition", value: req ? req.requisitionReference || req.title : null },
    { label: "Financial year", value: row.financialYear?.label },
    { label: "Department", value: dept ? `${dept.name}${dept.code ? ` (${dept.code})` : ""}` : null },
    { label: "Category", value: req?.category },
    { label: "Estimated value", value: formatMoneyUGX(req?.estimatedTotalValue) },
    { label: "Method approved on", value: formatPrintDate(row.methodSelectedAt) },
    {
      label: "Budget line",
      value: row.budgetLine ? [row.budgetLine.code, row.budgetLine.name].filter(Boolean).join(" — ") : null,
    },
    { label: "Plan item", value: row.procurementPlanItem?.title },
    { label: "Procurement officer", value: row.officer?.displayName },
    { label: "Created on", value: formatPrintDate(row.createdAt) },
    ...(req?.needDescription ? [{ label: "Need", value: req.needDescription, full: true }] : []),
  ];
}

/**
 * Head PDU review and Contracts Committee decisions on the evaluation report, oldest first.
 * @param {any} row
 */
function evaluationDecisions(row) {
  return (row.timeline || [])
    .filter((a) => a.decision && /^(review|approve) evaluation/i.test(String(a.taskTitle || "")))
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
}

/**
 * Latest decision on each workflow step of one stage, in step order.
 * @param {any} row
 * @param {string} stage
 */
function stageStepDecisions(row, stage) {
  /** @type {Map<string, any>} */
  const byStep = new Map();
  const sorted = [...(row.timeline || [])]
    .filter((a) => a.source === "workflow" && a.decision && a.taskTitle)
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  for (const a of sorted) {
    if (procurementTaskStage(a.taskTitle) !== stage) continue;
    const step = String(a.taskTitle).split(":")[0].trim();
    byStep.delete(step);
    byStep.set(step, a);
  }
  return [...byStep.entries()].map(([step, a]) => ({ step, a }));
}

const DECISION_COLUMNS = [
  { id: "date", label: "Date", width: "14%" },
  { id: "step", label: "Decision on" },
  { id: "decision", label: "Decision", width: "14%" },
  { id: "by", label: "Decided by", width: "18%" },
  { id: "seat", label: "Committee and seat", width: "26%" },
];

/**
 * Committee decisions on a stage's steps (stages without their own decision table).
 * @param {string} stage
 * @param {any} row
 * @returns {PrintSection[]}
 */
function committeeDecisionSections(stage, row) {
  if (stage === "evaluation" || stage === "award") return [];
  const decisions = stageStepDecisions(row, stage).filter(({ a }) => isCommitteeAction(a));
  if (!decisions.length) return [];
  return [
    {
      type: "table",
      title: `${procurementStageLabel(stage, row.procurementMethod)} — committee decisions`,
      columns: DECISION_COLUMNS,
      rows: decisions.map(({ step, a }) => ({
        key: a.id,
        cells: {
          date: formatPrintDate(a.createdAt),
          step,
          decision: workflowDecisionPastLabel(a.decision),
          by: a.actor?.displayName || "—",
          seat: actingRoleLabel(a) || "—",
        },
        note: a.comment || null,
      })),
    },
  ];
}

/**
 * Contracts Committee decisions on PDU recommendations (cancel / change provider).
 * @param {any[]} recommendations
 * @returns {PrintSection[]}
 */
function recommendationSections(recommendations) {
  const decided = (recommendations || []).filter((r) => r.decidedBy);
  if (!decided.length) return [];
  return [
    {
      type: "table",
      title: "Contracts Committee decisions on PDU recommendations",
      columns: [
        { id: "date", label: "Date", width: "14%" },
        { id: "kind", label: "Recommendation" },
        { id: "decision", label: "Decision", width: "14%" },
        { id: "by", label: "Decided by", width: "18%" },
        { id: "seat", label: "Committee and seat", width: "26%" },
      ],
      rows: decided.map((r) => ({
        key: r.id,
        cells: {
          date: formatPrintDate(r.decidedAt),
          kind: `${r.kindLabel}${r.recommendedBy?.displayName ? ` (by ${r.recommendedBy.displayName})` : ""}`,
          decision: human(r.status),
          by: r.decidedBy.displayName || "—",
          seat: actingRoleLabel(r.decidedBy) || "—",
        },
        note: [r.reasonLabel, r.decisionComment].filter(Boolean).join(" — ") || null,
      })),
    },
  ];
}

/**
 * Award recommendation: best evaluated bidder, price against the estimate, the evaluation
 * approval it rests on, the recommendation/approval steps and the award record.
 * @param {string} title
 * @param {any} row
 * @returns {PrintSection[]}
 */
function awardSections(title, row) {
  const report = row.evaluationReports?.[0] || null;
  const estimate = Number(row.requisition?.estimatedTotalValue) || 0;
  const price = Number(report?.evaluatedAmount) || 0;
  const variance = price - estimate;
  const evalApproval = [...evaluationDecisions(row)].reverse().find((a) => /^approve/i.test(a.taskTitle));
  const allBidders = Array.isArray(report?.eligibility?.bidders) ? report.eligibility.bidders : [];
  const ranked = allBidders.filter((b) => b.qualifies).sort((a, b) => Number(a.amount) - Number(b.amount));
  const notEligible = allBidders.filter((b) => !b.qualifies);
  const a = row.award;
  const pq = row.postQualificationReports?.[0] || null;
  const awardApproval =
    stageStepDecisions(row, "award")
      .map(({ a: d }) => d)
      .reverse()
      .find((d) => d.decision === "APPROVE" && /^approve award/i.test(String(d.taskTitle || ""))) || null;

  /** @type {PrintSection[]} */
  const out = [
    {
      type: "fields",
      title,
      fields: [
        { label: "Best evaluated bidder", value: report?.recommendedSupplier?.name },
        { label: "Contract price", value: report ? formatMoneyUGX(price) : null },
        { label: "Estimated value", value: formatMoneyUGX(estimate) },
        {
          label: "Against estimate",
          value: !report || !estimate
            ? null
            : variance > 0
              ? `Over by ${formatMoneyUGX(variance)}`
              : `Within estimate (saves ${formatMoneyUGX(-variance)})`,
        },
        { label: "Evaluation report", value: report ? human(report.status) : "Not prepared" },
        { label: "Evaluation approved on", value: formatPrintDate(report?.approvedAt) },
        {
          label: "Evaluation approved by",
          value: evalApproval
            ? `${evalApproval.actor?.displayName || "—"} · ${actingRoleLabel(evalApproval) || ""}`
            : null,
          full: true,
        },
        { label: "Evaluation committee", value: report?.committee?.name },
        ...(pq
          ? [
              { label: "Post-qualification", value: human(pq.status) },
              { label: "Post-qualified on", value: formatPrintDate(pq.approvedAt || pq.createdAt) },
            ]
          : []),
        ...(report?.recommendation ? [{ label: "Evaluation recommendation", value: report.recommendation, full: true }] : []),
        ...(report?.comments ? [{ label: "Evaluation committee comments", value: report.comments, full: true }] : []),
      ],
    },
    {
      type: "table",
      title: "Bidders ranked",
      columns: [
        { id: "rank", label: "Rank", width: "10%" },
        { id: "provider", label: "Bidder" },
        { id: "eligibility", label: "Eligibility", width: "16%" },
        { id: "amount", label: "Evaluated price", align: "right", width: "22%" },
      ],
      rows: [
        ...ranked.map((b, i) => ({
          key: b.supplierId,
          cells: {
            rank: i + 1,
            provider: `${b.name}${b.supplierId === report?.recommendedSupplier?.id ? " (recommended)" : ""}`,
            eligibility: "Eligible",
            amount: formatMoneyUGX(b.amount),
          },
        })),
        ...notEligible.map((b) => ({
          key: b.supplierId,
          cells: { rank: "—", provider: b.name, eligibility: "Not eligible", amount: formatMoneyUGX(b.amount) },
          note: (b.failedReasons || []).join("; ") || null,
        })),
      ],
      empty: "No evaluation results.",
    },
    {
      type: "table",
      title: "Award recommendation and approval",
      columns: [
        { id: "date", label: "Date", width: "16%" },
        { id: "step", label: "Step" },
        { id: "decision", label: "Decision", width: "16%" },
        { id: "by", label: "By", width: "18%" },
        { id: "role", label: "Role", width: "22%" },
      ],
      rows: stageStepDecisions(row, "award").map(({ step, a: d }) => ({
        key: d.id,
        cells: {
          date: formatPrintDate(d.createdAt),
          step,
          decision: workflowDecisionPastLabel(d.decision),
          by: d.actor?.displayName || "—",
          role: actingRoleLabel(d) || "—",
        },
        note: d.comment || null,
      })),
      empty: "Not started.",
    },
  ];

  if (a) {
    out.push({
      type: "fields",
      title: "Award",
      fields: [
        { label: "Provider", value: a.supplier?.name },
        { label: "Amount", value: formatMoneyUGX(a.awardedAmount) },
        { label: "Status", value: AWARD_STATUS_PRESENTATION[a.status]?.label || human(a.status) },
        { label: "Award date", value: formatPrintDate(a.awardDate) },
        { label: "Approval reference", value: a.approvalReference },
        {
          label: "Approved by",
          value: a.approvedBy?.displayName
            ? `${a.approvedBy.displayName}${actingRoleLabel(awardApproval) ? ` · ${actingRoleLabel(awardApproval)}` : ""}`
            : null,
        },
        { label: "Communicated on", value: formatPrintDate(a.communicatedAt) },
        ...(a.acceptedAt
          ? [
              { label: "Accepted by (supplier)", value: a.acceptedByName },
              { label: "Accepted on", value: formatPrintDate(a.acceptedAt) },
            ]
          : []),
        ...(a.declinedAt
          ? [
              { label: "Declined on", value: formatPrintDate(a.declinedAt) },
              { label: "Decline reason", value: a.declineReason, full: true },
            ]
          : []),
      ],
    });
    /** @type {Map<string, string>} */
    const bidders = new Map();
    for (const o of row.offers || []) {
      if (o.supplierId && !bidders.has(o.supplierId)) bidders.set(o.supplierId, o.supplier?.name || "—");
    }
    out.push({
      type: "table",
      title: a.communicatedAt ? "Award notices sent" : "Award notices to send",
      columns: [
        { id: "bidder", label: "Bidder" },
        { id: "notice", label: "Notice", width: "30%" },
        { id: "date", label: "Date", width: "20%" },
      ],
      rows: [
        { key: a.supplierId || "winner", cells: { bidder: a.supplier?.name || "—", notice: "Award", date: formatPrintDate(a.communicatedAt) || "—" } },
        ...[...bidders.entries()]
          .filter(([id]) => id !== a.supplierId)
          .map(([id, name]) => ({
            key: id,
            cells: { bidder: name, notice: "Unsuccessful", date: formatPrintDate(a.communicatedAt) || "—" },
          })),
      ],
    });
  }
  return out;
}

/**
 * Evaluation report: bids opened, eligibility (preliminary examination), financial comparison,
 * recommendation, post-qualification (tender) and the committee that evaluated.
 * @param {string} title
 * @param {any} row
 * @returns {PrintSection[]}
 */
function evaluationSections(title, row) {
  const report = row.evaluationReports?.[0] || null;
  const sol = row.solicitations?.[0] || null;
  const offers = row.offers || [];
  const validOffers = offers.filter((o) => !["WITHDRAWN", "LATE"].includes(o.status));
  const eligibility = Array.isArray(report?.eligibility?.bidders) ? report.eligibility.bidders : [];
  const ranked = eligibility
    .filter((b) => b.qualifies)
    .sort((a, b) => Number(a.amount) - Number(b.amount));
  const offerBySupplier = new Map(offers.map((o) => [o.supplierId, o]));
  const pq = row.postQualificationReports?.[0] || null;
  const members = report?.committee?.members || [];

  /** @type {PrintSection[]} */
  const out = [
    {
      type: "fields",
      title,
      fields: [
        { label: "Evaluation committee", value: report?.committee?.name },
        { label: "Report status", value: report ? human(report.status) : "Not started" },
        { label: "Bids opened on", value: formatPrintDate(sol?.openedAt) },
        { label: "Bids received", value: `${validOffers.length} valid of ${offers.length}` },
        { label: "Report prepared on", value: formatPrintDate(report?.createdAt) },
        { label: "Report approved on", value: formatPrintDate(report?.approvedAt) },
        ...(sol?.bidDocument?.evaluationCriteria
          ? [{ label: "Evaluation criteria", value: sol.bidDocument.evaluationCriteria, full: true }]
          : []),
      ],
    },
    {
      type: "table",
      title: "Bids received and opened",
      columns: [
        { id: "provider", label: "Bidder" },
        { id: "submitted", label: "Submitted", width: "16%" },
        { id: "days", label: "Delivery", width: "12%" },
        { id: "status", label: "Status", width: "14%" },
        { id: "amount", label: "Read-out price", align: "right", width: "20%" },
      ],
      rows: offers.map((o) => ({
        key: o.id,
        cells: {
          provider: o.supplier?.name || "—",
          submitted: formatPrintDate(o.submittedAt),
          days: o.deliveryDays ? `${o.deliveryDays} days` : "—",
          status: human(o.status),
          amount: formatMoneyUGX(o.amount),
        },
        note:
          (o.lineItems || [])
            .map((l) => `${l.itemName}: ${l.quantity} × ${formatMoneyUGX(l.unitPrice)} = ${formatMoneyUGX(l.total)}`)
            .join("; ") || null,
      })),
      empty: "No bids.",
    },
  ];

  if (!report) return out;

  out.push(
    {
      type: "table",
      title: "Preliminary examination (eligibility)",
      columns: [
        { id: "provider", label: "Bidder" },
        { id: "result", label: "Result", width: "18%" },
        { id: "amount", label: "Price", align: "right", width: "20%" },
      ],
      rows: eligibility.map((b) => ({
        key: b.supplierId,
        cells: {
          provider: b.name,
          result: b.qualifies ? "Eligible" : "Not eligible",
          amount: formatMoneyUGX(b.amount),
        },
        note: !b.qualifies && b.failedReasons?.length ? b.failedReasons.join("; ") : null,
      })),
      empty: "Eligibility not recorded.",
    },
    {
      type: "table",
      title: "Financial comparison",
      columns: [
        { id: "rank", label: "Rank", width: "10%" },
        { id: "provider", label: "Eligible bidder" },
        { id: "days", label: "Delivery", width: "14%" },
        { id: "amount", label: "Evaluated price", align: "right", width: "22%" },
      ],
      rows: ranked.map((b, i) => {
        const days = offerBySupplier.get(b.supplierId)?.deliveryDays;
        return {
          key: b.supplierId,
          cells: {
            rank: i + 1,
            provider: b.name,
            days: days ? `${days} days` : "—",
            amount: formatMoneyUGX(b.amount),
          },
        };
      }),
      empty: "No bidder passed eligibility.",
    },
    {
      type: "fields",
      title: "Recommendation",
      fields: [
        { label: "Recommended bidder", value: report.recommendedSupplier?.name },
        { label: "Evaluated amount", value: formatMoneyUGX(report.evaluatedAmount) },
        { label: "Recommendation", value: report.recommendation, full: true },
        ...(report.comments ? [{ label: "Committee comments", value: report.comments, full: true }] : []),
      ],
    },
  );

  for (const w of report.eligibility?.warnings || []) {
    out.push({ type: "text", title: "Warning recorded", text: w });
  }

  if (pq) {
    out.push({
      type: "table",
      title: `Post-qualification — ${human(pq.status)}${pq.validation?.name ? ` · ${pq.validation.name}` : ""}`,
      columns: [
        { id: "check", label: "Check" },
        { id: "result", label: "Result", width: "16%" },
        { id: "reason", label: "Details", width: "40%" },
      ],
      rows: (pq.validation?.checks || []).map((c) => ({
        key: c.key,
        cells: {
          check: c.label,
          result: c.passed ? (c.warning ? "Passed (warning)" : "Passed") : "Failed",
          reason: c.reason || "—",
        },
      })),
      empty: "Not run.",
    });
  }

  out.push({
    type: "table",
    title: "Review and Contracts Committee decision",
    columns: [
      { id: "date", label: "Date", width: "16%" },
      { id: "step", label: "Step" },
      { id: "decision", label: "Decision", width: "16%" },
      { id: "by", label: "By", width: "18%" },
      { id: "role", label: "Role", width: "22%" },
    ],
    rows: evaluationDecisions(row).map((a) => ({
      key: a.id,
      cells: {
        date: formatPrintDate(a.createdAt),
        step: String(a.taskTitle || "").split(":")[0],
        decision: workflowDecisionPastLabel(a.decision),
        by: a.actor?.displayName || "—",
        role: actingRoleLabel(a) || "—",
      },
      note: a.comment || null,
    })),
    empty: "Awaiting review.",
  });

  out.push({
    type: "table",
    title: "Evaluation committee",
    columns: [
      { id: "name", label: "Name" },
      { id: "role", label: "Committee role", width: "30%" },
    ],
    rows: members.map((m, i) => ({
      key: `${m.name}-${i}`,
      cells: { name: m.name || "—", role: committeeSeatLabel(m.committeeRole) || "—" },
    })),
    empty: "No committee recorded.",
  });

  return out;
}

/**
 * @param {string} key
 * @param {any} row
 * @param {any} piDoc
 * @returns {PrintSection[]}
 */
function stageSections(key, row, piDoc) {
  const title = `${procurementStageLabel(key, row.procurementMethod)} — ${describeProcurementStage(key, row).status.label}`;
  switch (key) {
    case "sourcing": {
      const sol = row.solicitations?.[0];
      if (!sol) return [{ type: "text", title, text: "Not started." }];
      const doc = sol.bidDocument || null;
      const inDocumentsPhase =
        /^(prepare|review|approve) (rfq|tender) documents/i.test(String(row.currentStepLabel || "")) &&
        ["DRAFT", "REVIEW"].includes(sol.status);
      return [
        {
          type: "fields",
          title,
          fields: [
            { label: "Document", value: sol.title, full: true },
            { label: "Status", value: inDocumentsPhase && row.stageLabel ? row.stageLabel : human(sol.status) },
            { label: "Issued on", value: formatPrintDate(sol.issueDate || sol.bidDocument?.issueDate) },
            { label: "Closing date", value: formatPrintDate(sol.closingDate) },
            { label: "Opened on", value: formatPrintDate(sol.openedAt) },
            ...(sol.bidDocument
              ? [
                  {
                    label: "Issued by",
                    value: [sol.bidDocument.issuedByName, sol.bidDocument.issuedByPosition]
                      .filter(Boolean)
                      .join(", "),
                  },
                  { label: "Document filled", value: formatPrintDate(sol.bidDocumentAt) },
                ]
              : []),
            {
              label: "Invited providers",
              value: (sol.invites || []).map((i) => i.supplier?.name).filter(Boolean).join(", ") || "Open advertisement",
              full: true,
            },
          ],
        },
        ...(doc
          ? [
              {
                type: "fields",
                title: sol.solicitationType === "TENDER" ? "Tender document" : "Request for Quotations (RFQ) document",
                fields: [
                  { label: "Document title", value: doc.documentTitle, full: true },
                  { label: "Procuring and Disposing Entity (PDE)", value: doc.pdeName },
                  { label: "Procurement reference", value: doc.procurementReference },
                  { label: "Subject", value: doc.subject, full: true },
                  { label: "Specifications / scope", value: doc.specifications, full: true },
                  { label: "Submission instructions", value: doc.submissionInstructions, full: true },
                  { label: "Evaluation criteria", value: doc.evaluationCriteria, full: true },
                ],
              },
            ]
          : []),
        {
          type: "table",
          title: "Offers received",
          columns: [
            { id: "provider", label: "Provider" },
            { id: "submitted", label: "Submitted", width: "18%" },
            { id: "status", label: "Status", width: "16%" },
            { id: "amount", label: "Amount", align: "right", width: "20%" },
          ],
          rows: (row.offers || []).map((o) => ({
            key: o.id,
            cells: {
              provider: o.supplier?.name || "—",
              submitted: formatPrintDate(o.submittedAt),
              status: human(o.status),
              amount: formatMoneyUGX(o.amount),
            },
            note: o.remarks || null,
          })),
          empty: "No offers.",
        },
      ];
    }
    case "evaluation":
      return evaluationSections(title, row);
    case "award":
      return awardSections(title, row);
    case "contract": {
      if (row.procurementMethod === "MICRO") {
        if (!piDoc) return [{ type: "text", title, text: "Not issued." }];
        const { pi } = piDoc;
        return [
          {
            type: "fields",
            title,
            fields: [
              { label: "Instruction no.", value: pi.instructionNumber },
              { label: "Provider", value: pi.supplier?.name },
              { label: "Amount", value: formatMoneyUGX(pi.amount) },
              { label: "Issued on", value: formatPrintDate(pi.issuedAt) },
              { label: "Deliver by", value: formatPrintDate(pi.requiredDeliveryDate) },
              { label: "Issued by", value: pi.issuedBy?.displayName },
              { label: "Delivery address", value: pi.deliveryAddress, full: true },
              { label: "Payment terms", value: pi.paymentTerms, full: true },
              ...(pi.status === "ACCEPTED"
                ? [{ label: "Accepted by", value: `${pi.acceptedByName || "—"} · ${formatPrintDate(pi.acceptedAt)}`, full: true }]
                : []),
              ...(pi.status === "DECLINED"
                ? [{ label: "Declined", value: `${formatPrintDate(pi.declinedAt)} · ${pi.declineReason || ""}`, full: true }]
                : []),
            ],
          },
          {
            type: "table",
            title: "Order lines",
            columns: [
              { id: "n", label: "#", width: "6%" },
              { id: "item", label: "Item" },
              { id: "qty", label: "Qty", align: "right", width: "10%" },
              { id: "unit", label: "Unit", width: "12%" },
              { id: "price", label: "Unit price", align: "right", width: "16%" },
              { id: "total", label: "Total", align: "right", width: "18%" },
            ],
            rows: piDoc.items.map((i) => ({
              key: i.lineNumber,
              cells: {
                n: i.lineNumber,
                item: i.itemName,
                qty: i.quantity,
                unit: i.unitOfMeasure || "—",
                price: formatMoneyUGX(i.unitPrice),
                total: formatMoneyUGX(i.total),
              },
              note: i.description || null,
            })),
            footer: { label: "Order total", value: formatMoneyUGX(pi.amount) },
          },
        ];
      }
      const c = row.contract;
      const l = row.lpo;
      if (!c && !l) return [{ type: "text", title, text: "Not issued." }];
      return [
        {
          type: "fields",
          title,
          fields: c
            ? [
                { label: "Contract no.", value: c.contractNumber },
                { label: "Provider", value: c.supplier?.name },
                { label: "Value", value: formatMoneyUGX(c.contractValue) },
                { label: "Status", value: human(c.status) },
                { label: "Start date", value: formatPrintDate(c.startDate) },
                { label: "End date", value: formatPrintDate(c.endDate) },
                { label: "Issued on", value: formatPrintDate(c.issuedAt) },
                { label: "Delivery address", value: c.deliveryAddress, full: true },
              ]
            : [
                { label: "LPO no.", value: l.lpoNumber },
                { label: "Provider", value: l.supplier?.name },
                { label: "Value", value: formatMoneyUGX(l.lpoValue) },
                { label: "Status", value: human(l.status) },
                { label: "Issued on", value: formatPrintDate(l.issuedAt) },
                { label: "Accepted on", value: formatPrintDate(l.acceptedAt) },
                { label: "Delivery address", value: l.deliveryAddress, full: true },
              ],
        },
      ];
    }
    case "delivery":
      return [
        {
          type: "table",
          title,
          columns: [
            { id: "date", label: "Received", width: "14%" },
            { id: "note", label: "Delivery note", width: "16%" },
            { id: "by", label: "Recorded by", width: "18%" },
            { id: "inspection", label: "Inspection" },
            { id: "inspector", label: "Inspected by", width: "18%" },
          ],
          rows: (row.deliveries || []).map((d) => ({
            key: d.id,
            cells: {
              date: formatPrintDate(d.deliveryDate || d.createdAt),
              note: d.deliveryNote?.noteNumber || "—",
              by: d.recordedBy?.displayName || "—",
              inspection: d.inspection ? human(d.inspection.status) : "Awaiting inspection",
              inspector: d.inspection?.inspectedBy?.displayName || "—",
            },
            note:
              (d.lines || [])
                .map(
                  (ln) =>
                    `${ln.itemName}: received ${ln.receivedQuantity}, accepted ${ln.acceptedQuantity}, rejected ${ln.rejectedQuantity}`,
                )
                .join("; ") || null,
          })),
          empty: "No deliveries.",
        },
      ];
    case "invoice":
      return [
        {
          type: "table",
          title,
          columns: [
            { id: "number", label: "Invoice no.", width: "18%" },
            { id: "provider", label: "Provider" },
            { id: "date", label: "Date", width: "14%" },
            { id: "status", label: "Status", width: "16%" },
            { id: "amount", label: "Amount", align: "right", width: "18%" },
          ],
          rows: (row.invoices || []).map((i) => ({
            key: i.id,
            cells: {
              number: i.invoiceNumber,
              provider: i.supplier?.name || "—",
              date: formatPrintDate(i.invoiceDate || i.createdAt),
              status: human(i.status),
              amount: formatMoneyUGX(i.amount),
            },
            note: i.rejectionReason ? `Rejected: ${i.rejectionReason}` : i.notes || null,
          })),
          empty: "No invoices.",
        },
      ];
    case "payment":
      return [
        {
          type: "table",
          title,
          columns: [
            { id: "date", label: "Date", width: "14%" },
            { id: "reference", label: "Reference" },
            { id: "by", label: "Approved by", width: "22%" },
            { id: "status", label: "Status", width: "14%" },
            { id: "amount", label: "Amount", align: "right", width: "18%" },
          ],
          rows: (row.payments || []).map((p) => ({
            key: p.id,
            cells: {
              date: formatPrintDate(p.paymentDate || p.createdAt),
              reference: p.paymentReference || "—",
              by: p.approvedBy?.displayName || "—",
              status: human(p.status),
              amount: formatMoneyUGX(p.amount),
            },
          })),
          empty: "No payments.",
        },
      ];
    case "closure":
      return [
        {
          type: "fields",
          title,
          fields: [
            { label: "Closed on", value: formatPrintDate(row.closedAt) },
            { label: "Closed by", value: row.closedBy?.displayName },
            ...(row.closureRemarks ? [{ label: "Remarks", value: row.closureRemarks, full: true }] : []),
          ],
        },
      ];
    default:
      return [];
  }
}

/**
 * @param {any} award
 * @returns {import("@/components/print/print-document").PrintSignature}
 */
function awardAcceptanceSignature(award) {
  return {
    label: "Award accepted by supplier",
    name: award.acceptedByName || null,
    role: award.supplier?.name || "Supplier",
    date: award.acceptedAt,
  };
}

/**
 * Who signs off the printed record: the preparer plus the people who approved the printed stages.
 * @param {any} row
 * @param {string[]} keys
 * @param {any} piDoc
 * @param {string | null} [stage] single-stage print: signed by whoever acted on that stage's steps
 * @returns {import("@/components/print/print-document").PrintSignature[]}
 */
function signaturesFor(row, keys, piDoc, stage = null) {
  if (stage) {
    /** @type {import("@/components/print/print-document").PrintSignature[]} */
    const signed = [];
    const report = row.evaluationReports?.[0] || null;
    if (stage === "evaluation" && report) {
      for (const m of report.committee?.members || []) {
        signed.push({
          label: `Evaluation Committee ${committeeSeatLabel(m.committeeRole) || "Member"}`,
          name: m.name || null,
          role: report.committee?.name || null,
          date: null,
        });
      }
    }
    for (const { step, a } of stageStepDecisions(row, stage)) {
      if (stage === "evaluation" && /technical|financial|prepare evaluation|post-qualification/i.test(step)) continue;
      signed.push({
        label: `${step} — ${workflowDecisionPastLabel(a.decision)}`,
        name: a.actor?.displayName || null,
        role: actingRoleLabel(a),
        date: a.createdAt,
      });
    }
    if (stage === "award" && row.award?.acceptedAt) signed.push(awardAcceptanceSignature(row.award));
    return signed.length
      ? signed
      : [{ label: "Prepared by", name: row.officer?.displayName || null, role: "Procurement Officer", date: row.createdAt }];
  }
  /** @type {import("@/components/print/print-document").PrintSignature[]} */
  const out = [
    { label: "Prepared by", name: row.officer?.displayName || null, role: "Procurement Officer", date: row.createdAt },
  ];
  const has = (/** @type {string} */ k) => keys.includes(k);
  const pi = piDoc?.pi || null;
  const inspection = [...(row.deliveries || [])].reverse().find((d) => d.inspection?.inspectedBy)?.inspection;
  const payment = [...(row.payments || [])].reverse().find((p) => p.approvedBy);
  const evalReport = row.evaluationReports?.[0] || null;
  if (has("evaluation") && evalReport) {
    for (const m of evalReport.committee?.members || []) {
      out.push({
        label: `Evaluation Committee ${committeeSeatLabel(m.committeeRole) || "Member"}`,
        name: m.name || null,
        role: evalReport.committee?.name || null,
        date: null,
      });
    }
    const latestByStep = new Map();
    for (const a of evaluationDecisions(row)) latestByStep.set(/^approve/i.test(a.taskTitle) ? "approve" : "review", a);
    const review = latestByStep.get("review");
    const approve = latestByStep.get("approve");
    if (review) {
      out.push({ label: "Reviewed by", name: review.actor?.displayName || null, role: actingRoleLabel(review), date: review.createdAt });
    }
    if (approve) {
      out.push({
        label: `Contracts Committee — ${workflowDecisionPastLabel(approve.decision)}`,
        name: approve.actor?.displayName || null,
        role: actingRoleLabel(approve),
        date: approve.createdAt,
      });
    }
  }
  if (has("award") && row.award?.approvedBy) {
    const awardApproval = stageStepDecisions(row, "award")
      .map(({ a }) => a)
      .reverse()
      .find((a) => a.decision === "APPROVE");
    out.push({
      label: "Award approved by",
      name: row.award.approvedBy.displayName,
      role: awardApproval ? actingRoleLabel(awardApproval) : null,
      date: row.award.awardDate,
    });
  }
  if (has("award") && row.award?.acceptedAt) {
    out.push(awardAcceptanceSignature(row.award));
  }
  if (has("contract") && pi?.issuedBy) {
    out.push({ label: "Issued by", name: pi.issuedBy.displayName, role: pi.issuedBy.roleName || null, date: pi.issuedAt });
  }
  if (has("delivery") && inspection) {
    out.push({ label: "Inspected by", name: inspection.inspectedBy.displayName, role: null, date: inspection.inspectedAt });
  }
  if (has("payment") && payment) {
    out.push({ label: "Payment approved by", name: payment.approvedBy.displayName, role: null, date: payment.paymentDate || payment.updatedAt });
  }
  if (has("closure") && row.closedBy) {
    out.push({ label: "Closed by", name: row.closedBy.displayName, role: null, date: row.closedAt });
  }
  if (out.length === 1) {
    const approval = [...(row.timeline || [])].reverse().find((a) => a.decision === "APPROVE" && a.actor?.displayName);
    if (approval) {
      out.push({ label: "Approved by", name: approval.actor.displayName, role: actingRoleLabel(approval), date: approval.createdAt });
    }
  }
  return out;
}

/**
 * Printable procurement record limited to the stages the viewer's role may see
 * (and to one stage when `stage` is set).
 * @param {{
 *   row: any;
 *   sections: Record<string, { view: boolean }> | null;
 *   stage?: string | null;
 *   piDoc?: any;
 *   organisation: { name: string; code?: string | null } | null;
 *   printedBy?: { name?: string | null; role?: string | null } | null;
 *   recommendations?: any[];
 * }} p
 */
export function ProcurementPrint({ row, sections, stage = null, piDoc = null, organisation, printedBy, recommendations = [] }) {
  const keys = procurementStagesForMethod(row.procurementMethod).filter(
    (k) => (!stage || k === stage) && (!sections || sections[k]?.view),
  );

  return (
    <PrintDocument
      documentTitle={stage ? procurementStageLabel(stage, row.procurementMethod) : "Procurement record"}
      reference={row.procurementNumber}
      status={row.stageLabel || row.status}
      organisation={organisation || { name: "" }}
      printedBy={printedBy}
      sections={[
        { type: "fields", title: "Procurement details", fields: detailFields(row) },
        ...keys.flatMap((k) => [...stageSections(k, row, piDoc), ...committeeDecisionSections(k, row)]),
        ...(stage ? [] : recommendationSections(recommendations)),
      ]}
      signatures={signaturesFor(row, keys, piDoc, stage)}
    />
  );
}
