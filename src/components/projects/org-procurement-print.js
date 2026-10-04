"use client";

import { PrintDocument, formatPrintDate, formatPrintDateTime } from "@/components/print/print-document";
import { formatMoneyUGX } from "@/lib/money";
import { describeProcurementStage } from "@/lib/projects/procurement-stage-status";
import { procurementStageLabel, procurementStagesForMethod } from "@/lib/projects/procurement-task-stage";
import { workflowDecisionPastLabel } from "@/lib/projects/workflow-status-presentation";

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
      return [
        {
          type: "fields",
          title,
          fields: [
            { label: "Document", value: sol.title, full: true },
            { label: "Status", value: human(sol.status) },
            { label: "Issued on", value: formatPrintDate(sol.issueDate) },
            { label: "Closing date", value: formatPrintDate(sol.closingDate) },
            { label: "Opened on", value: formatPrintDate(sol.openedAt) },
            {
              label: "Invited providers",
              value: (sol.invites || []).map((i) => i.supplier?.name).filter(Boolean).join(", ") || "Open advertisement",
              full: true,
            },
          ],
        },
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
      return [
        {
          type: "table",
          title,
          columns: [
            { id: "date", label: "Date", width: "16%" },
            { id: "provider", label: "Recommended provider" },
            { id: "amount", label: "Evaluated amount", align: "right", width: "20%" },
            { id: "status", label: "Status", width: "14%" },
            { id: "approved", label: "Approved on", width: "16%" },
          ],
          rows: (row.evaluationReports || []).map((e) => ({
            key: e.id,
            cells: {
              date: formatPrintDate(e.createdAt),
              provider: e.recommendedSupplier?.name || "—",
              amount: formatMoneyUGX(e.evaluatedAmount),
              status: human(e.status),
              approved: formatPrintDate(e.approvedAt),
            },
            note: e.recommendation || null,
          })),
          empty: "No evaluation report.",
        },
      ];
    case "award": {
      const a = row.award;
      if (!a) return [{ type: "text", title, text: "Not started." }];
      return [
        {
          type: "fields",
          title,
          fields: [
            { label: "Provider", value: a.supplier?.name },
            { label: "Amount", value: formatMoneyUGX(a.awardedAmount) },
            { label: "Status", value: human(a.status) },
            { label: "Award date", value: formatPrintDate(a.awardDate) },
            { label: "Approval reference", value: a.approvalReference },
            { label: "Approved by", value: a.approvedBy?.displayName },
            { label: "Communicated on", value: formatPrintDate(a.communicatedAt) },
            { label: "Accepted on", value: formatPrintDate(a.acceptedAt) },
          ],
        },
      ];
    }
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
 * Who signs off the printed record: the preparer plus the people who approved the printed stages.
 * @param {any} row
 * @param {string[]} keys
 * @param {any} piDoc
 * @returns {import("@/components/print/print-document").PrintSignature[]}
 */
function signaturesFor(row, keys, piDoc) {
  /** @type {import("@/components/print/print-document").PrintSignature[]} */
  const out = [
    { label: "Prepared by", name: row.officer?.displayName || null, role: "Procurement Officer", date: row.createdAt },
  ];
  const has = (/** @type {string} */ k) => keys.includes(k);
  const pi = piDoc?.pi || null;
  const inspection = [...(row.deliveries || [])].reverse().find((d) => d.inspection?.inspectedBy)?.inspection;
  const payment = [...(row.payments || [])].reverse().find((p) => p.approvedBy);
  if (has("award") && row.award?.approvedBy) {
    out.push({ label: "Award approved by", name: row.award.approvedBy.displayName, role: null, date: row.award.awardDate });
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
      out.push({ label: "Approved by", name: approval.actor.displayName, role: approval.actorRoleName || null, date: approval.createdAt });
    }
  }
  return out;
}

/**
 * Approval trail from the procurement's (section-filtered) timeline.
 * @param {any} row
 * @returns {PrintSection}
 */
export function approvalTrailSection(row) {
  return {
    type: "table",
    title: "Approval trail",
    columns: [
      { id: "date", label: "Date", width: "16%" },
      { id: "action", label: "Action" },
      { id: "actor", label: "By", width: "18%" },
      { id: "role", label: "Role", width: "16%" },
      { id: "comment", label: "Comment", width: "22%" },
    ],
    rows: (row?.timeline || []).map((a) => ({
      key: a.id,
      cells: {
        date: formatPrintDateTime(a.createdAt),
        action: a.actionText || workflowDecisionPastLabel(a.decision),
        actor: a.actor?.displayName || "—",
        role: a.actorRoleName || "—",
        comment: a.comment || "—",
      },
    })),
    empty: "No actions yet.",
  };
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
 * }} p
 */
export function ProcurementPrint({ row, sections, stage = null, piDoc = null, organisation, printedBy }) {
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
        ...keys.flatMap((k) => stageSections(k, row, piDoc)),
        approvalTrailSection(row),
      ]}
      signatures={signaturesFor(row, keys, piDoc)}
    />
  );
}
