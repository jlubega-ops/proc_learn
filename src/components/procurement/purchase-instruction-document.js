"use client";

import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { PrintDocument, formatPrintDate } from "@/components/print/print-document";
import { RecordDetailsGrid } from "@/components/projects/record-details-grid";
import { adminMutedTextSx, adminOutlinedTableContainerSx } from "@/lib/admin-mui-surfaces";
import { formatMoneyUGX } from "@/lib/money";
import { presentPurchaseInstructionStatus } from "@/lib/projects/purchase-instruction-presentation";
import { approvalTrailSection } from "@/components/projects/org-procurement-print";

/**
 * @typedef {{
 *   pi: any;
 *   procurement: { procurementNumber: string; title: string; category?: string | null; department?: string | null; financialYear?: string | null };
 *   items: { lineNumber: number; itemName: string; description?: string | null; quantity: string; unitOfMeasure?: string | null; unitPrice?: string | null; total?: string | null }[];
 *   organisation: { name: string; code?: string | null };
 * }} PurchaseInstructionDoc
 */

/** @param {any} pi */
function issuedByLine(pi) {
  if (!pi?.issuedBy?.displayName) return null;
  return `${pi.issuedBy.displayName}${pi.issuedBy.roleName ? ` · ${pi.issuedBy.roleName}` : ""}`;
}

/** @param {PurchaseInstructionDoc} doc */
function detailFields(doc) {
  const { pi, procurement } = doc;
  return [
    { label: "Provider", value: pi.supplier?.name, wide: true },
    { label: "Procurement", value: `${procurement.procurementNumber} — ${procurement.title}`, wide: true },
    { label: "Department", value: procurement.department },
    { label: "Financial year", value: procurement.financialYear },
    { label: "Category", value: procurement.category },
    { label: "Amount", value: formatMoneyUGX(pi.amount) },
    { label: "Issued on", value: pi.issuedAt ? formatPrintDate(pi.issuedAt) : null },
    { label: "Deliver by", value: pi.requiredDeliveryDate ? formatPrintDate(pi.requiredDeliveryDate) : null },
    { label: "Issued by", value: issuedByLine(pi), wide: true },
    { label: "Delivery address", value: pi.deliveryAddress, full: true },
    { label: "Payment terms", value: pi.paymentTerms, full: true },
    ...(pi.specialInstructions ? [{ label: "Special instructions", value: pi.specialInstructions, full: true }] : []),
    ...(pi.status === "ACCEPTED"
      ? [{ label: "Accepted by", value: `${pi.acceptedByName || "—"} · ${formatPrintDate(pi.acceptedAt)}`, full: true }]
      : []),
    ...(pi.status === "DECLINED"
      ? [{ label: "Declined", value: `${formatPrintDate(pi.declinedAt)} · ${pi.declineReason || ""}`, full: true }]
      : []),
  ];
}

/** @param {PurchaseInstructionDoc["items"]} items */
function itemsTotal(items) {
  return items.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
}

/**
 * On-screen read-only purchase instruction (org and provider portal).
 * @param {{ doc: PurchaseInstructionDoc; title?: string; action?: import("react").ReactNode }} p
 */
export function PurchaseInstructionView({ doc, title = "Purchase instruction", action = null }) {
  const status = presentPurchaseInstructionStatus(doc.pi?.status);
  return (
    <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          <Typography variant="body2" sx={adminMutedTextSx}>
            {doc.pi.instructionNumber}
          </Typography>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip size="small" color={status.color} label={status.label} />
          {action}
        </div>
      </div>
      <RecordDetailsGrid fields={detailFields(doc)} />
      <TableContainer className="mt-3 overflow-x-auto rounded-lg border" sx={{ borderColor: "divider" }}>
        <Table size="small" aria-label="Order lines">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Item</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell>Unit</TableCell>
              <TableCell align="right">Unit price</TableCell>
              <TableCell align="right">Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {doc.items.map((i) => (
              <TableRow key={i.lineNumber}>
                <TableCell>{i.lineNumber}</TableCell>
                <TableCell>
                  <span className="font-medium">{i.itemName}</span>
                  {i.description ? (
                    <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                      {i.description}
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell align="right">{i.quantity}</TableCell>
                <TableCell>{i.unitOfMeasure || "—"}</TableCell>
                <TableCell align="right" className="whitespace-nowrap">
                  {formatMoneyUGX(i.unitPrice)}
                </TableCell>
                <TableCell align="right" className="whitespace-nowrap">
                  {formatMoneyUGX(i.total)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={5} align="right" sx={{ fontWeight: 700 }}>
                Order total
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }} className="whitespace-nowrap">
                {formatMoneyUGX(doc.pi.amount || itemsTotal(doc.items))}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

/**
 * Formal A4 purchase instruction (PPDA Contracts Regs 2023, regs 6 and 9). `row` (the
 * organisation's procurement) adds the internal references and the approval trail.
 * @param {{ doc: PurchaseInstructionDoc; row?: any; printedBy?: { name?: string | null; role?: string | null } | null }} p
 */
export function PurchaseInstructionPrint({ doc, row = null, printedBy }) {
  const { pi, procurement } = doc;
  const status = presentPurchaseInstructionStatus(pi.status);
  const s = pi.supplier || {};
  const req = row?.requisition;
  return (
    <PrintDocument
      documentTitle="Purchase instruction"
      reference={pi.instructionNumber}
      status={status.label}
      organisation={doc.organisation}
      printedBy={printedBy}
      sections={[
        {
          type: "fields",
          title: "Provider",
          fields: [
            { label: "Name", value: s.name, full: true },
            { label: "TIN", value: s.tin },
            { label: "Registration no.", value: s.registrationRef },
            { label: "Contact person", value: s.contactPerson },
            { label: "Phone", value: s.phone },
            { label: "Email", value: s.email },
            { label: "Address", value: s.physicalAddress, full: true },
          ],
        },
        {
          type: "fields",
          title: "Order details",
          fields: [
            { label: "Procurement", value: procurement.procurementNumber },
            { label: "Method", value: "Micro procurement" },
            { label: "Subject", value: procurement.title, full: true },
            ...(req ? [{ label: "Requisition", value: req.requisitionReference || req.title }] : []),
            { label: "Department", value: procurement.department },
            { label: "Financial year", value: procurement.financialYear },
            { label: "Category", value: procurement.category },
            ...(row
              ? [
                  {
                    label: "Budget line",
                    value: row.budgetLine
                      ? [row.budgetLine.code, row.budgetLine.name].filter(Boolean).join(" — ")
                      : null,
                  },
                  { label: "Plan item", value: row.procurementPlanItem?.title },
                  { label: "Procurement officer", value: row.officer?.displayName },
                ]
              : []),
            { label: "Issued on", value: formatPrintDate(pi.issuedAt) },
            { label: "Deliver by", value: formatPrintDate(pi.requiredDeliveryDate) },
            { label: "Delivery address", value: pi.deliveryAddress, full: true },
            ...(pi.status === "ACCEPTED"
              ? [{ label: "Accepted by", value: `${pi.acceptedByName || "—"} · ${formatPrintDate(pi.acceptedAt)}`, full: true }]
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
          footer: { label: "Order total", value: formatMoneyUGX(pi.amount || itemsTotal(doc.items)) },
        },
        { type: "text", title: "Payment terms", text: pi.paymentTerms || "—" },
        ...(pi.specialInstructions
          ? [{ type: /** @type {const} */ ("text"), title: "Special instructions", text: pi.specialInstructions }]
          : []),
        ...(pi.status === "DECLINED"
          ? [{ type: /** @type {const} */ ("text"), title: "Declined by provider", text: pi.declineReason || "—" }]
          : []),
        ...(row ? [approvalTrailSection(row)] : []),
      ]}
      signatures={[
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
      ]}
    />
  );
}
