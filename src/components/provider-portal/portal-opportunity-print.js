"use client";

import { PrintDocument, formatPrintDate, formatPrintDateTime } from "@/components/print/print-document";
import { OFFER_STATUS } from "@/components/provider-portal/provider-portal-sections";
import { formatMoneyUGX } from "@/lib/money";

/**
 * Provider's printable copy of one opportunity: the issued request, items, own offers and history.
 * @param {{ data: any }} p
 */
export function PortalOpportunityPrint({ data }) {
  const { procurement, document: doc } = data;
  const word = data.type === "RFQ" ? "Quotation" : "Bid";

  /** @type {import("@/components/print/print-document").PrintSection[]} */
  const sections = [
    {
      type: "fields",
      title: data.type === "RFQ" ? "Request for quotations" : "Bidding document",
      fields: [
        { label: "Procuring and Disposing Entity (PDE)", value: doc.pdeName, full: true },
        { label: "Procurement reference", value: doc.reference },
        { label: "Category", value: procurement.category },
        { label: "Issued on", value: formatPrintDate(data.issueDate) },
        { label: "Closing date", value: formatPrintDateTime(data.closingDate) },
        { label: "Issued by", value: doc.issuedByName },
        { label: "Position", value: doc.issuedByPosition },
        { label: "Delivery location", value: procurement.deliveryLocation, full: true },
        { label: "Subject of procurement", value: doc.subject, full: true },
        { label: "Specifications / scope", value: doc.specifications, full: true },
        { label: "Submission instructions", value: doc.submissionInstructions, full: true },
        { label: "Evaluation criteria", value: doc.evaluationCriteria, full: true },
      ],
    },
  ];

  if (data.items?.length) {
    sections.push({
      type: "table",
      title: "Items requested",
      columns: [
        { id: "n", label: "#", width: "6%" },
        { id: "item", label: "Item" },
        { id: "qty", label: "Qty", align: "right", width: "12%" },
        { id: "unit", label: "Unit", width: "14%" },
      ],
      rows: data.items.map((i) => ({
        key: i.lineNumber,
        cells: { n: i.lineNumber, item: i.itemName, qty: i.quantity, unit: i.unitOfMeasure || "—" },
        note: [i.description, i.specification].filter(Boolean).join(" — ") || null,
      })),
    });
  }

  const current = data.myOffer && data.myOffer.status !== "WITHDRAWN" ? data.myOffer : null;
  if (current?.lineItems?.length) {
    sections.push({
      type: "table",
      title: `${word} price schedule`,
      columns: [
        { id: "n", label: "#", width: "6%" },
        { id: "item", label: "Item" },
        { id: "qty", label: "Qty", align: "right", width: "12%" },
        { id: "unitPrice", label: "Unit price", align: "right", width: "20%" },
        { id: "total", label: "Total", align: "right", width: "20%" },
      ],
      rows: [
        ...current.lineItems.map((l) => ({
          key: l.lineNumber,
          cells: {
            n: l.lineNumber,
            item: l.itemName,
            qty: `${l.quantity} ${l.unitOfMeasure || ""}`.trim(),
            unitPrice: formatMoneyUGX(l.unitPrice),
            total: formatMoneyUGX(l.total),
          },
        })),
        { key: "total", cells: { n: "", item: "Total", qty: "", unitPrice: "", total: formatMoneyUGX(current.amount) } },
      ],
    });
  }

  sections.push(
    {
      type: "table",
      title: `Your ${word.toLowerCase()}s`,
      columns: [
        { id: "date", label: "Submitted", width: "22%" },
        { id: "status", label: "Status", width: "18%" },
        { id: "days", label: "Delivery", width: "16%" },
        { id: "amount", label: "Total price", align: "right" },
      ],
      rows: (data.offers || []).map((o) => ({
        key: o.id,
        cells: {
          date: formatPrintDateTime(o.submittedAt),
          status: OFFER_STATUS[o.status]?.label || o.status,
          days: o.deliveryDays ? `${o.deliveryDays} days` : "—",
          amount: formatMoneyUGX(o.amount),
        },
        note: o.remarks || null,
      })),
      empty: `No ${word.toLowerCase()} submitted.`,
    },
  );

  return (
    <PrintDocument
      documentTitle={data.type === "RFQ" ? "Request for quotations" : "Bidding document"}
      reference={doc.reference || procurement.number}
      status={
        data.accepting
          ? "Open for offers"
          : data.outcome
            ? data.outcome.label
            : data.decided
              ? "Under evaluation"
              : "Closed"
      }
      organisation={data.organisation || { name: doc.pdeName || "" }}
      printedBy={data.printedBy}
      sections={sections}
      signatures={[
        { label: "Issued by", name: doc.issuedByName, role: doc.issuedByPosition, date: data.issueDate },
        { label: `${word} by`, name: data.myOffer ? data.printedBy?.name : null, role: data.printedBy?.role, date: data.myOffer?.submittedAt },
      ]}
    />
  );
}
