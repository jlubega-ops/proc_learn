"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import MenuItem from "@mui/material/MenuItem";
import DoneAllRounded from "@mui/icons-material/DoneAllRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import { PORTAL_NOTIFICATIONS_CHANGED } from "@/components/provider-portal/provider-portal-shell";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TablePagination from "@mui/material/TablePagination";
import TextField from "@mui/material/TextField";
import PlaceRounded from "@mui/icons-material/PlaceRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import { format } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import { actionConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { formatMoneyUGX, parseMoneyInput, validatePositiveMoney } from "@/lib/money";
import { draftLinesTotal } from "@/lib/projects/offer-line-items";
import { BRAND_CARD_CLASS } from "@/lib/brand-ui";
import {
  formatPortalDate,
  formatPortalDateTime,
  portalFetch,
  usePortalList,
} from "@/components/provider-portal/portal-fetch";

export const OFFER_STATUS = {
  SUBMITTED: { color: "info", label: "Submitted" },
  OPENED: { color: "info", label: "Opened" },
  WITHDRAWN: { color: "warning", label: "Withdrawn" },
  REJECTED: { color: "error", label: "Rejected" },
  LATE: { color: "error", label: "Late — not accepted" },
};
export const INVOICE_STATUS = {
  RECEIVED: { color: "warning", label: "Received — pending review" },
  CERTIFIED: { color: "info", label: "Certified" },
  VERIFIED: { color: "info", label: "Verified" },
  APPROVED_FOR_PAYMENT: { color: "success", label: "Approved for payment" },
  REJECTED: { color: "error", label: "Rejected" },
  DRAFT: { color: "warning", label: "Draft" },
};
export const AWARD_STATUS = {
  COMMUNICATED: { color: "warning", label: "Awaiting your response" },
  ACCEPTED: { color: "success", label: "Accepted" },
  DECLINED: { color: "error", label: "Declined" },
  CANCELLED: { color: "error", label: "Cancelled" },
};

/** LPO / contract status as the provider sees it. */
export const ORDER_STATUS = {
  ISSUED: { color: "warning", label: "Awaiting your response" },
  ACCEPTED: { color: "success", label: "Accepted" },
  ACTIVE: { color: "success", label: "Accepted · active" },
  DECLINED: { color: "error", label: "Declined" },
  CANCELLED: { color: "error", label: "Cancelled" },
};

export const PAYMENT_STATUS = {
  PENDING: { color: "warning", label: "Pending" },
  APPROVED: { color: "info", label: "Approved" },
  PAID: { color: "success", label: "Paid" },
  REJECTED: { color: "error", label: "Rejected" },
  CANCELLED: { color: "error", label: "Cancelled" },
};
export const ORDER_KIND = {
  PURCHASE_INSTRUCTION: "Purchase instruction",
  LPO: "Local purchase order",
  CONTRACT: "Contract",
};

/**
 * @param {{ map: Record<string, { color: string; label: string }>; status: string }} p
 */
export function StatusChip({ map, status }) {
  const s = map[status] || { color: "info", label: status };
  return <Chip size="small" color={/** @type {any} */ (s.color)} label={s.label} />;
}

/**
 * @param {{ loading: boolean; error: string; empty: boolean; emptyText: string; children: import("react").ReactNode }} p
 */
export function ListState({ loading, error, empty, emptyText, children }) {
  if (loading && empty) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-zinc-600" role="status" aria-busy>
        <CircularProgress size={18} /> Loading…
      </div>
    );
  }
  if (error) return <Alert severity="error">{error}</Alert>;
  if (empty) return <p className="py-8 text-center text-sm text-zinc-600">{emptyText}</p>;
  return <div className={loading ? "opacity-60 transition-opacity" : ""}>{children}</div>;
}

const CARD_CLICKABLE_CLASS =
  "cursor-pointer transition hover:border-primary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * Whole-card link to an item page; renders a plain card when there is no target.
 * @param {{ href?: string | null; label: string; children: import("react").ReactNode }} p
 */
function CardLink({ href, label, children }) {
  if (!href) return <div className={`${BRAND_CARD_CLASS} p-4`}>{children}</div>;
  return (
    <Link href={href} title={label} aria-label={label} className={`${BRAND_CARD_CLASS} ${CARD_CLICKABLE_CLASS} block p-4`}>
      {children}
    </Link>
  );
}

/** @param {string | null | undefined} procurementId */
function assignmentHref(procurementId) {
  return procurementId ? `/provider-portal/assignments/${procurementId}` : null;
}

/**
 * @param {{ total: number; page: number; pageSize: number; setPage: (n: number) => void; setPageSize: (n: number) => void }} p
 */
function Pager({ total, page, pageSize, setPage, setPageSize }) {
  return (
    <TablePagination
      component="div"
      count={total}
      page={page}
      onPageChange={(_e, next) => setPage(next)}
      rowsPerPage={pageSize}
      onRowsPerPageChange={(e) => {
        setPageSize(Number(e.target.value));
        setPage(0);
      }}
      rowsPerPageOptions={[5, 10, 20]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Opportunities (RFQs / tenders) + bid submit / edit / withdraw       */
/* ------------------------------------------------------------------ */

/**
 * @param {{ opportunity: any; onClose: () => void; onSaved: () => void }} p
 */
export function OfferDialog({ opportunity, onClose, onSaved }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const existing = opportunity.myOffer && opportunity.canEdit ? opportunity.myOffer : null;
  const prefill = existing || opportunity.draftOffer || null;
  const word = opportunity.type === "RFQ" ? "quotation" : "bid";
  const items = Array.isArray(opportunity.items) ? opportunity.items : [];
  const byLine = items.length > 0 && items.every((i) => Number(i.quantity) > 0);
  const [unitPrices, setUnitPrices] = useState(() => {
    /** @type {Record<string, string>} */
    const map = {};
    for (const l of prefill?.lineItems || []) map[String(l.lineNumber)] = String(l.unitPrice ?? "");
    return map;
  });
  const [amount, setAmount] = useState(prefill?.amount ? String(prefill.amount) : "");
  const [deliveryDays, setDeliveryDays] = useState(prefill?.deliveryDays ? String(prefill.deliveryDays) : "");
  const [remarks, setRemarks] = useState(prefill?.remarks || "");
  /** @type {[Record<string, string>, Function]} */
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const lineTotal = byLine ? draftLinesTotal(items, unitPrices) : 0;
  const total = byLine ? lineTotal : parseMoneyInput(amount);

  async function submit(e) {
    e.preventDefault();
    /** @type {Record<string, string>} */
    const next = {};
    if (byLine) {
      for (const i of items) {
        const err = validatePositiveMoney(unitPrices[String(i.lineNumber)] || "", "Unit price");
        if (err) next[`line_${i.lineNumber}`] = err;
      }
    } else {
      const amountErr = validatePositiveMoney(amount, "Amount");
      if (amountErr) next.amount = amountErr;
    }
    if (deliveryDays.trim()) {
      const n = Number(deliveryDays);
      if (!Number.isInteger(n) || n < 1 || n > 730) next.deliveryDays = "Enter whole days between 1 and 730.";
    }
    setErrors(next);
    if (Object.keys(next).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    const verb = existing ? `Update ${word}` : `Submit ${word}`;
    const confirmed = await confirm(
      actionConfirmOptions(verb, { message: `Total price ${formatMoneyUGX(total)}.` }),
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      const payload = {
        amount: total,
        lineItems: byLine
          ? items.map((i) => ({
              lineNumber: i.lineNumber,
              unitPrice: parseMoneyInput(unitPrices[String(i.lineNumber)] || ""),
            }))
          : null,
        deliveryDays: deliveryDays.trim() || null,
        remarks: remarks.trim() || null,
      };
      const { ok, data } = existing
        ? await portalFetch(`/api/provider-portal/offers/${existing.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await portalFetch("/api/provider-portal/offers", {
            method: "POST",
            body: JSON.stringify({ ...payload, solicitationId: opportunity.id }),
          });
      if (!ok) {
        if (data.fieldErrors) setErrors(data.fieldErrors);
        showToast({ message: typeof data.error === "string" ? data.error : `Could not save the ${word}.`, severity: "error" });
        return;
      }
      showToast({ message: existing ? `Your ${word} was updated.` : `Your ${word} was submitted.`, severity: "success" });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form noValidate onSubmit={submit}>
        <DialogTitle>{existing ? `Edit ${word}` : `Submit ${word}`}</DialogTitle>
        <DialogContent dividers className="space-y-3">
          <p className="text-sm text-zinc-700">
            <span className="font-semibold">{opportunity.title}</span> · {opportunity.procurement?.number}
            {opportunity.closingDate ? ` · closes ${formatPortalDateTime(opportunity.closingDate)}` : ""}
          </p>
          {byLine ? (
            <div className="space-y-2">
              {items.map((i) => {
                const key = String(i.lineNumber);
                const err = errors[`line_${i.lineNumber}`];
                const unit = Number(parseMoneyInput(unitPrices[key] || ""));
                const qty = Number(i.quantity);
                return (
                  <div
                    key={key}
                    className="grid grid-cols-1 items-start gap-2 rounded-lg border border-zinc-200 p-2 sm:grid-cols-[1fr_10rem]"
                  >
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold wrap-break-word">
                        {i.lineNumber}. {i.itemName}
                      </p>
                      <p className="text-xs text-zinc-600">
                        {qty} {i.unitOfMeasure || "units"}
                        {Number.isFinite(unit) && unit > 0 ? ` · ${formatMoneyUGX(unit * qty)}` : ""}
                      </p>
                    </div>
                    <TextField
                      label="Unit price (UGX)"
                      value={unitPrices[key] || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setUnitPrices((p) => ({ ...p, [key]: v }));
                        setErrors((p) => ({ ...p, [`line_${i.lineNumber}`]: "" }));
                      }}
                      error={Boolean(err)}
                      helperText={err || " "}
                      inputMode="decimal"
                      fullWidth
                    />
                  </div>
                );
              })}
              <p className="text-right text-sm">
                Total <span className="font-bold">{formatMoneyUGX(lineTotal)}</span>
              </p>
            </div>
          ) : (
            <TextField
              label="Total price (UGX)"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setErrors((p) => ({ ...p, amount: "" }));
              }}
              error={Boolean(errors.amount)}
              helperText={errors.amount || "Inclusive of taxes"}
              inputMode="decimal"
              fullWidth
              autoFocus
            />
          )}
          <TextField
            label="Delivery period in days (optional)"
            value={deliveryDays}
            onChange={(e) => {
              setDeliveryDays(e.target.value);
              setErrors((p) => ({ ...p, deliveryDays: "" }));
            }}
            error={Boolean(errors.deliveryDays)}
            helperText={errors.deliveryDays || "How many days after the order you will deliver"}
            inputMode="numeric"
            fullWidth
          />
          <TextField
            label="Remarks (optional)"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
          <p className="text-xs text-zinc-600">
            {opportunity.revising ? "Editable until evaluation starts." : "Editable until the closing date."}
          </p>
        </DialogContent>
        <DialogActions className="flex-wrap gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
          >
            {busy ? "Saving…" : existing ? `Update ${word}` : `Submit ${word}`}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** @param {any} o */
export function opportunityStateChip(o) {
  if (o.accepting) return { color: "info", label: `Open until ${formatPortalDateTime(o.closingDate)}` };
  if (o.outcome) return { color: o.outcome.color, label: o.outcome.label };
  if (o.decided) return { color: "warning", label: "Under evaluation" };
  return { color: "error", label: "Closed" };
}

export function PortalOpportunities() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const list = usePortalList("/api/provider-portal/opportunities", { page, pageSize });

  return (
    <section aria-labelledby="pp-opps" className="space-y-3">
      <h2 id="pp-opps" className="text-base font-semibold text-primary">
        Opportunities
      </h2>
      <p className="text-sm text-zinc-600">
        Requests for quotation you were invited to, and tenders advertised by the organisation.
      </p>
      <ListState
        loading={list.loading}
        error={list.error}
        empty={!list.items.length}
        emptyText="No opportunities right now. Invitations and advertised tenders will appear here."
      >
        <ul className="space-y-3">
          {list.items.map((o) => {
            const state = opportunityStateChip(o);
            return (
              <li key={o.id}>
                <CardLink href={`/provider-portal/opportunities/${o.id}`} label={`Open ${o.title}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold wrap-break-word">{o.title}</p>
                      <p className="text-xs text-zinc-600">
                        {o.type === "RFQ" ? "Request for quotation" : "Open tender"} · {o.procurement?.number}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {o.canSubmit ? (
                        <Chip size="small" color="warning" label="Action needed" />
                      ) : o.openClarifications ? (
                        <Chip size="small" color="warning" label="Clarification requested" />
                      ) : null}
                      <ChevronRightRounded aria-hidden className="text-zinc-400" />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <Chip size="small" color={/** @type {any} */ (state.color)} label={state.label} />
                    {o.myOffer ? (
                      <>
                        <StatusChip map={OFFER_STATUS} status={o.myOffer.status} />
                        <span>
                          Your offer: <span className="font-semibold">{formatMoneyUGX(o.myOffer.amount)}</span>
                          {o.myOffer.deliveryDays ? ` · ${o.myOffer.deliveryDays} days` : ""}
                        </span>
                      </>
                    ) : (
                      <span className="text-zinc-600">No offer submitted</span>
                    )}
                  </div>
                  {o.procurement?.deliveryLocation ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-zinc-600">
                      <PlaceRounded fontSize="inherit" aria-hidden /> Deliver to: {o.procurement.deliveryLocation}
                    </p>
                  ) : null}
                </CardLink>
              </li>
            );
          })}
        </ul>
      </ListState>
      <Pager total={list.total} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Orders + invoice submission                                         */
/* ------------------------------------------------------------------ */

/** @param {{ label: string; children: import("react").ReactNode }} p */
function InvoiceField({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="m-0 text-sm font-medium wrap-break-word">{children || "—"}</dd>
    </div>
  );
}

/**
 * Invoice as the procurement unit will receive it.
 * @param {{ order: any; invoice: { amount: string; invoiceDate: string; notes: string; supplierReference?: string } }} p
 */
function InvoicePreview({ order, invoice }) {
  const provider = order.provider || {};
  const org = order.organisation || {};
  const items = order.acceptedItems || [];
  const priced = items.some((it) => it.unitPrice);
  return (
    <div className="rounded-lg border border-zinc-300 bg-white p-4 text-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-3">
        <div className="min-w-0">
          <p className="text-base font-bold wrap-break-word">{provider.name || "—"}</p>
          {provider.physicalAddress ? <p className="text-xs wrap-break-word">{provider.physicalAddress}</p> : null}
          <p className="text-xs wrap-break-word">
            {[provider.email, provider.phone].filter(Boolean).join(" · ")}
          </p>
          {provider.tin ? <p className="text-xs">TIN {provider.tin}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-lg font-extrabold tracking-wide text-primary">INVOICE</p>
          <p className="text-sm font-semibold">{order.invoiceNumber}</p>
          {invoice.supplierReference?.trim() ? (
            <p className="text-xs">Your ref {invoice.supplierReference.trim()}</p>
          ) : null}
          <p className="text-xs">{formatPortalDate(invoice.invoiceDate)}</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <InvoiceField label="Bill to">
          {org.name ? `${org.name}${org.code ? ` (${org.code})` : ""}` : null}
        </InvoiceField>
        <InvoiceField label={ORDER_KIND[order.kind] || "Order"}>
          {order.number ? `${order.number} · ${formatMoneyUGX(order.value)}` : null}
        </InvoiceField>
        <InvoiceField label="Procurement">
          {order.procurementNumber ? `${order.procurementNumber} · ${order.title || ""}` : null}
        </InvoiceField>
        <InvoiceField label="Delivered to">{order.deliveryLocation}</InvoiceField>
      </dl>
      {items.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-300 text-left text-xs uppercase text-zinc-500">
                <th className="py-1.5 pr-2">#</th>
                <th className="py-1.5 pr-2">Item</th>
                <th className="py-1.5 pr-2 text-right">Accepted qty</th>
                {priced ? (
                  <>
                    <th className="py-1.5 pr-2 text-right">Unit price</th>
                    <th className="py-1.5 text-right">Amount</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.itemName} className="border-b border-zinc-100">
                  <td className="py-1.5 pr-2">{i + 1}</td>
                  <td className="py-1.5 pr-2 wrap-break-word">{it.itemName}</td>
                  <td className="py-1.5 pr-2 text-right">
                    {it.quantity}
                    {it.unitOfMeasure ? ` ${it.unitOfMeasure}` : ""}
                  </td>
                  {priced ? (
                    <>
                      <td className="py-1.5 pr-2 text-right">{it.unitPrice ? formatMoneyUGX(it.unitPrice) : "—"}</td>
                      <td className="py-1.5 text-right">
                        {it.unitPrice ? formatMoneyUGX(it.unitPrice * it.quantity) : "—"}
                      </td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between border-t border-zinc-300 pt-3">
        <span className="text-sm font-semibold">Total due</span>
        <span className="text-lg font-bold">{formatMoneyUGX(parseMoneyInput(invoice.amount))}</span>
      </div>
      {invoice.notes.trim() ? (
        <p className="mt-2 text-xs text-zinc-600 wrap-break-word">{invoice.notes.trim()}</p>
      ) : null}
    </div>
  );
}

/**
 * @param {{ order: any; onSaved: () => void }} p
 */
export function SubmitInvoiceCard({ order, onSaved }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [amount, setAmount] = useState(String(order.invoiceable || ""));
  const [invoiceDate, setInvoiceDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [supplierReference, setSupplierReference] = useState("");
  const [notes, setNotes] = useState("");
  /** @type {[Record<string, string>, Function]} */
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");

  async function submit(e) {
    e.preventDefault();
    /** @type {Record<string, string>} */
    const next = {};
    const amountErr = validatePositiveMoney(amount, "Amount");
    if (amountErr) next.amount = amountErr;
    else if (Number(parseMoneyInput(amount)) > Number(order.invoiceable) + 0.5) {
      next.amount = `Max ${formatMoneyUGX(order.invoiceable)} for accepted goods.`;
    }
    if (!invoiceDate) next.invoiceDate = "Enter the invoice date.";
    else if (invoiceDate > today) next.invoiceDate = "Date cannot be in the future.";
    if (supplierReference.trim().length > 64) next.supplierReference = "Max 64 characters.";
    if (notes.trim().length > 2000) next.notes = "Max 2000 characters.";
    setErrors(next);
    if (Object.keys(next).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    if (!(await confirm(actionConfirmOptions("Submit invoice")))) return;
    setBusy(true);
    try {
      const { ok, data } = await portalFetch("/api/provider-portal/invoices", {
        method: "POST",
        body: JSON.stringify({
          procurementId: order.procurement?.id,
          amount: parseMoneyInput(amount),
          invoiceDate,
          supplierReference: supplierReference.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!ok) {
        if (data.fieldErrors) setErrors(data.fieldErrors);
        showToast({ message: typeof data.error === "string" ? data.error : "Could not submit the invoice.", severity: "error" });
        return;
      }
      showToast({ message: "Invoice submitted. The procurement unit has been notified.", severity: "success" });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${BRAND_CARD_CLASS} p-4`} aria-labelledby="pp-submit-invoice">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="pp-submit-invoice" className="text-base font-semibold text-primary">
          Submit invoice
        </h2>
        <Chip size="small" variant="outlined" color="info" label={order.invoiceNumber || "Auto-numbered"} />
      </div>
      <form noValidate onSubmit={submit} className="space-y-4" aria-busy={busy}>
        <dl className="grid gap-3 rounded-lg border border-zinc-200 p-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-zinc-500">Against</dt>
            <dd className="font-semibold">
              {ORDER_KIND[order.kind]} {order.number}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Order value</dt>
            <dd>{formatMoneyUGX(order.value)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Already invoiced</dt>
            <dd>{formatMoneyUGX(order.invoiced)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">You can invoice</dt>
            <dd className="font-semibold text-primary">{formatMoneyUGX(order.invoiceable)}</dd>
          </div>
        </dl>

        <div className="grid gap-x-3 sm:grid-cols-2">
          <TextField
            label="Amount (UGX)"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setErrors((p) => ({ ...p, amount: "" }));
            }}
            error={Boolean(errors.amount)}
            helperText={errors.amount || "Accepted goods only"}
            fullWidth
            slotProps={{ htmlInput: { inputMode: "decimal" } }}
          />
          <TextField
            label="Invoice date"
            type="date"
            value={invoiceDate}
            onChange={(e) => {
              setInvoiceDate(e.target.value);
              setErrors((p) => ({ ...p, invoiceDate: "" }));
            }}
            error={Boolean(errors.invoiceDate)}
            helperText={errors.invoiceDate || " "}
            fullWidth
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
          />
          <TextField
            label="Your invoice ref"
            value={supplierReference}
            onChange={(e) => {
              setSupplierReference(e.target.value);
              setErrors((p) => ({ ...p, supplierReference: "" }));
            }}
            error={Boolean(errors.supplierReference)}
            helperText={errors.supplierReference || "Optional"}
            fullWidth
          />
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setErrors((p) => ({ ...p, notes: "" }));
            }}
            error={Boolean(errors.notes)}
            helperText={errors.notes || "Optional"}
            fullWidth
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold text-zinc-500">Preview</p>
          <InvoicePreview order={order} invoice={{ amount, invoiceDate, notes, supplierReference }} />
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
            className="w-full sm:w-auto"
          >
            {busy ? "Submitting…" : "Submit invoice"}
          </Button>
        </div>
      </form>
    </section>
  );
}

export function PortalAssignments() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const list = usePortalList("/api/provider-portal/assignments", { page, pageSize });

  return (
    <section aria-labelledby="pp-assignments" className="space-y-3">
      <h2 id="pp-assignments" className="text-base font-semibold text-primary">
        Assignments
      </h2>
      <ListState
        loading={list.loading}
        error={list.error}
        empty={!list.items.length}
        emptyText="No assignments yet."
      >
        <ul className="space-y-3">
          {list.items.map((a) => (
            <li key={a.procurementId}>
              <CardLink href={assignmentHref(a.procurementId)} label={`Open ${a.procurementNumber}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold wrap-break-word">{a.title}</p>
                    <p className="text-xs text-zinc-600 wrap-break-word">
                      {a.procurementNumber}
                      {a.order ? ` · ${ORDER_KIND[a.order.kind]} ${a.order.number}` : ""}
                    </p>
                  </div>
                  <ChevronRightRounded color="primary" className="shrink-0" aria-hidden />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <Chip size="small" color={a.status.color} label={a.status.label} />
                  {a.value ? (
                    <span>
                      Value <span className="font-semibold">{formatMoneyUGX(a.value)}</span>
                    </span>
                  ) : null}
                  <span className="text-zinc-600">Updated {formatPortalDate(a.updatedAt)}</span>
                </div>
              </CardLink>
            </li>
          ))}
        </ul>
      </ListState>
      <Pager total={list.total} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
    </section>
  );
}

export function PortalNotifications() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [filter, setFilter] = useState("all");
  const [reloadKey, setReloadKey] = useState(0);
  const path = filter === "all" ? "/api/provider-portal/notifications" : `/api/provider-portal/notifications?filter=${filter}`;
  const list = usePortalList(path, { page, pageSize, reloadKey });
  const [open, setOpen] = useState(/** @type {any} */ (null));

  async function markRead(body) {
    await portalFetch("/api/provider-portal/notifications", { method: "PATCH", body: JSON.stringify(body) });
    setReloadKey((k) => k + 1);
    window.dispatchEvent(new Event(PORTAL_NOTIFICATIONS_CHANGED));
  }

  return (
    <section aria-labelledby="pp-notifications" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="pp-notifications" className="text-base font-semibold text-primary">
          Notifications
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <TextField
            select
            label="Show"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="unread">Unread</MenuItem>
            <MenuItem value="read">Read</MenuItem>
          </TextField>
          <Button variant="outlined" startIcon={<DoneAllRounded />} onClick={() => void markRead({ all: true })}>
            Mark all read
          </Button>
        </div>
      </div>
      <ListState loading={list.loading} error={list.error} empty={!list.items.length} emptyText="No notifications.">
        <ul className="space-y-2">
          {list.items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(n);
                  if (!n.readAt) void markRead({ ids: [n.id] });
                }}
                className={`${BRAND_CARD_CLASS} w-full cursor-pointer p-3 text-left ${n.readAt ? "" : "border-l-4 border-l-primary"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className={`text-sm wrap-break-word ${n.readAt ? "" : "font-semibold"}`}>{n.title}</p>
                  <span className="text-xs text-zinc-500">{formatPortalDateTime(n.createdAt)}</span>
                </div>
                <p className="line-clamp-2 text-xs text-zinc-600">{n.body}</p>
              </button>
            </li>
          ))}
        </ul>
      </ListState>
      <Pager total={list.total} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
      <Dialog open={Boolean(open)} onClose={() => setOpen(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{open?.title}</DialogTitle>
        <DialogContent dividers>
          <p className="whitespace-pre-wrap text-sm">{open?.body}</p>
          <p className="mt-2 text-xs text-zinc-500">{formatPortalDateTime(open?.createdAt)}</p>
        </DialogContent>
        <DialogActions className="flex-wrap gap-2">
          <Button onClick={() => setOpen(null)}>Close</Button>
          {open?.linkUrl ? (
            <Button variant="contained" onClick={() => router.push(open.linkUrl)}>
              Open
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Invoices + payments                                                 */
/* ------------------------------------------------------------------ */

/**
 * @param {{ reloadKey?: number }} p
 */
export function PortalInvoices({ reloadKey = 0 }) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const list = usePortalList("/api/provider-portal/invoices", { page, pageSize, reloadKey });
  const toInvoice = Array.isArray(list.meta?.toInvoice) ? list.meta.toInvoice : [];

  return (
    <div className="space-y-6">
    {toInvoice.length ? (
      <section aria-labelledby="pp-to-invoice" className="space-y-3">
        <h2 id="pp-to-invoice" className="flex items-center gap-2 text-base font-semibold text-primary">
          To invoice
          <Chip size="small" color="warning" label={toInvoice.length} />
        </h2>
        <ul className="space-y-3">
          {toInvoice.map((a) => (
            <li key={a.procurementId}>
              <CardLink href={assignmentHref(a.procurementId)} label={`Invoice ${a.procurementNumber}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold wrap-break-word">{a.title}</p>
                    <p className="text-xs text-zinc-600 wrap-break-word">
                      {a.procurementNumber}
                      {a.order ? ` · ${ORDER_KIND[a.order.kind]} ${a.order.number}` : ""}
                    </p>
                  </div>
                  <ChevronRightRounded color="primary" className="shrink-0" aria-hidden />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  <Chip size="small" color="primary" label="Goods accepted — submit invoice" />
                  {a.value ? (
                    <span>
                      Order value <span className="font-semibold">{formatMoneyUGX(a.value)}</span>
                    </span>
                  ) : null}
                  {a.acceptedOn ? <span className="text-zinc-600">Accepted {formatPortalDate(a.acceptedOn)}</span> : null}
                </div>
              </CardLink>
            </li>
          ))}
        </ul>
      </section>
    ) : null}
    <section aria-labelledby="pp-invoices" className="space-y-3">
      <h2 id="pp-invoices" className="text-base font-semibold text-primary">
        Invoices
      </h2>
      <ListState
        loading={list.loading}
        error={list.error}
        empty={!list.items.length}
        emptyText="No invoices yet."
      >
        <ul className="space-y-3">
          {list.items.map((inv) => (
            <li key={inv.id}>
              <CardLink
                href={assignmentHref(inv.procurement?.id)}
                label={`Open ${inv.procurement?.number || inv.invoiceNumber}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold wrap-break-word">
                      {inv.supplierReference ? `Your ref ${inv.supplierReference}` : inv.invoiceNumber}
                    </p>
                    <p className="text-xs text-zinc-600">
                      {inv.invoiceNumber} · {inv.procurement?.number} · {formatPortalDate(inv.invoiceDate)}
                    </p>
                  </div>
                  <StatusChip map={INVOICE_STATUS} status={inv.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  <span>
                    Amount <span className="font-semibold">{formatMoneyUGX(inv.amount)}</span>
                  </span>
                  <span className="text-zinc-600">Paid {formatMoneyUGX(inv.paidAmount)}</span>
                  {inv.source === "OFFICER" ? (
                    <span className="text-zinc-600">Recorded by the procurement unit</span>
                  ) : null}
                </div>
                {inv.rejectionReason ? (
                  <Alert severity="error" variant="outlined" sx={{ mt: 1 }}>
                    {inv.rejectionReason}
                  </Alert>
                ) : null}
              </CardLink>
            </li>
          ))}
        </ul>
      </ListState>
      <Pager total={list.total} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
    </section>
    </div>
  );
}

export function PortalPayments() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const list = usePortalList("/api/provider-portal/payments", { page, pageSize });

  return (
    <section aria-labelledby="pp-payments" className="space-y-3">
      <h2 id="pp-payments" className="text-base font-semibold text-primary">
        Payments
      </h2>
      <ListState
        loading={list.loading}
        error={list.error}
        empty={!list.items.length}
        emptyText="No payments yet."
      >
        <ul className="space-y-3">
          {list.items.map((p) => (
            <li key={p.id}>
              <CardLink href={assignmentHref(p.procurement?.id)} label={`Open ${p.procurement?.number || "payment"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{formatMoneyUGX(p.amount)}</p>
                    <p className="text-xs text-zinc-600 wrap-break-word">
                      Invoice {p.invoice?.supplierReference || p.invoice?.invoiceNumber} · {p.procurement?.number}
                    </p>
                  </div>
                  <StatusChip map={PAYMENT_STATUS} status={p.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-zinc-700">
                  <span>Reference: {p.paymentReference || "—"}</span>
                  <span>Paid on: {formatPortalDate(p.paymentDate)}</span>
                </div>
              </CardLink>
            </li>
          ))}
        </ul>
      </ListState>
      <Pager total={list.total} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
    </section>
  );
}
