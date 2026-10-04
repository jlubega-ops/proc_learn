"use client";

import { PrintDocument, formatPrintDate, formatPrintDateTime } from "@/components/print/print-document";
import { INVOICE_STATUS, ORDER_KIND, PAYMENT_STATUS } from "@/components/provider-portal/provider-portal-sections";
import { formatMoneyUGX } from "@/lib/money";
import {
  DELIVERY_NOTE_STATUS_PRESENTATION,
  presentPurchaseInstructionStatus,
} from "@/lib/projects/purchase-instruction-presentation";

/** @param {unknown} v */
function human(v) {
  const s = String(v || "").replace(/_/g, " ").toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : "—";
}

/**
 * @param {Record<string, { label: string }>} map
 * @param {string} status
 */
function statusLabel(map, status) {
  return map[status]?.label || human(status);
}

/** @param {{ itemName: string; quantity?: string; receivedQuantity?: string; unitOfMeasure?: string | null }[]} lines */
function linesNote(lines) {
  return (
    (lines || [])
      .map((l) => `${l.itemName}: ${l.quantity ?? l.receivedQuantity ?? ""}${l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ""}`)
      .join("; ") || null
  );
}

/**
 * Provider's printable record of one assignment: order, dispatches, receipts, invoices, payments.
 * @param {{ data: any }} p
 */
export function PortalAssignmentPrint({ data }) {
  const { procurement, order } = data;
  const doc = data.purchaseInstructionDoc;
  const pi = doc?.pi || null;

  /** @type {import("@/components/print/print-document").PrintSection[]} */
  const sections = [
    {
      type: "fields",
      title: "Order details",
      fields: [
        { label: "Procurement no.", value: procurement.procurementNumber },
        { label: "Order", value: order ? `${ORDER_KIND[order.kind] || order.kind} ${order.number}` : "Not yet issued" },
        { label: "Subject", value: procurement.title, full: true },
        { label: "Order value", value: order ? formatMoneyUGX(order.value) : null },
        {
          label: "Order status",
          value: order ? (pi && order.kind === "PURCHASE_INSTRUCTION" ? presentPurchaseInstructionStatus(pi.status).label : human(order.status)) : null,
        },
        { label: "Category", value: procurement.category },
        { label: "Deliver by", value: pi?.requiredDeliveryDate ? formatPrintDate(pi.requiredDeliveryDate) : null },
        { label: "Delivery address", value: pi?.deliveryAddress || procurement.deliveryLocation, full: true },
        ...(pi?.paymentTerms ? [{ label: "Payment terms", value: pi.paymentTerms, full: true }] : []),
      ],
    },
  ];

  if (doc?.items?.length) {
    sections.push({
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
      rows: doc.items.map((i) => ({
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
      footer: { label: "Order total", value: formatMoneyUGX(pi?.amount) },
    });
  }

  sections.push(
    {
      type: "table",
      title: "Delivery notes",
      columns: [
        { id: "number", label: "Note no.", width: "22%" },
        { id: "date", label: "Dispatched", width: "18%" },
        { id: "status", label: "Status" },
      ],
      rows: data.deliveryNotes.map((n) => ({
        key: n.id,
        cells: {
          number: n.noteNumber,
          date: formatPrintDate(n.dispatchedAt),
          status: statusLabel(DELIVERY_NOTE_STATUS_PRESENTATION, n.status),
        },
        note: linesNote(n.lines),
      })),
      empty: "No delivery notes.",
    },
    {
      type: "table",
      title: "Receipts and inspection",
      columns: [
        { id: "date", label: "Received", width: "18%" },
        { id: "status", label: "Receipt", width: "20%" },
        { id: "inspection", label: "Inspection" },
        { id: "inspected", label: "Inspected on", width: "18%" },
      ],
      rows: data.deliveries.map((d) => ({
        key: d.id,
        cells: {
          date: formatPrintDate(d.deliveryDate),
          status: human(d.status),
          inspection: d.inspection ? human(d.inspection.status) : "Awaiting inspection",
          inspected: formatPrintDate(d.inspection?.inspectedAt),
        },
        note:
          (d.lines || [])
            .map((l) => `${l.itemName}: received ${l.receivedQuantity}, accepted ${l.acceptedQuantity}, rejected ${l.rejectedQuantity}`)
            .join("; ") || null,
      })),
      empty: "No receipts.",
    },
    {
      type: "table",
      title: "Invoices",
      columns: [
        { id: "number", label: "Invoice no.", width: "20%" },
        { id: "ref", label: "Your reference" },
        { id: "date", label: "Date", width: "14%" },
        { id: "status", label: "Status", width: "20%" },
        { id: "amount", label: "Amount", align: "right", width: "18%" },
      ],
      rows: data.invoices.map((i) => ({
        key: i.id,
        cells: {
          number: i.invoiceNumber,
          ref: i.supplierReference || "—",
          date: formatPrintDate(i.invoiceDate),
          status: statusLabel(INVOICE_STATUS, i.status),
          amount: formatMoneyUGX(i.amount),
        },
        note: i.rejectionReason ? `Rejected: ${i.rejectionReason}` : null,
      })),
      empty: "No invoices.",
    },
    {
      type: "table",
      title: "Payments",
      columns: [
        { id: "date", label: "Date", width: "18%" },
        { id: "ref", label: "Reference" },
        { id: "status", label: "Status", width: "18%" },
        { id: "amount", label: "Amount", align: "right", width: "20%" },
      ],
      rows: data.payments.map((p) => ({
        key: p.id,
        cells: {
          date: formatPrintDate(p.paymentDate),
          ref: p.paymentReference || "—",
          status: statusLabel(PAYMENT_STATUS, p.status),
          amount: formatMoneyUGX(p.amount),
        },
      })),
      empty: "No payments.",
    },
    {
      type: "table",
      title: "History",
      columns: [
        { id: "date", label: "Date", width: "18%" },
        { id: "action", label: "Action" },
        { id: "actor", label: "By", width: "22%" },
        { id: "role", label: "Role", width: "18%" },
      ],
      rows: (data.history || []).map((h) => ({
        key: h.id,
        cells: {
          date: formatPrintDateTime(h.createdAt),
          action: h.action,
          actor: h.actor || "—",
          role: h.role || "—",
        },
        note: h.comment || null,
      })),
      empty: "No actions yet.",
    },
  );

  return (
    <PrintDocument
      documentTitle="Order record"
      reference={order?.number || procurement.procurementNumber}
      status={data.status?.label || human(procurement.status)}
      organisation={data.organisation || doc?.organisation || { name: "" }}
      printedBy={data.printedBy}
      sections={sections}
      signatures={
        pi
          ? [
              {
                label: "Issued by",
                name: pi.issuedBy?.displayName || null,
                role: pi.issuedBy?.roleName || "Procurement Officer",
                date: pi.issuedAt,
              },
              {
                label: "Accepted by provider",
                name: pi.status === "ACCEPTED" ? pi.acceptedByName : null,
                role: pi.supplier?.name || "Provider",
                date: pi.status === "ACCEPTED" ? pi.acceptedAt : null,
              },
            ]
          : []
      }
    />
  );
}
