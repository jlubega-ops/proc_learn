"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import TablePagination from "@mui/material/TablePagination";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import EditRounded from "@mui/icons-material/EditRounded";
import PlaceRounded from "@mui/icons-material/PlaceRounded";
import ReceiptLongRounded from "@mui/icons-material/ReceiptLongRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import UndoRounded from "@mui/icons-material/UndoRounded";
import { format } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import { formatMoneyUGX, parseMoneyInput, validatePositiveMoney } from "@/lib/money";
import { BRAND_CARD_CLASS } from "@/lib/brand-ui";
import {
  formatPortalDate,
  formatPortalDateTime,
  portalFetch,
  usePortalList,
} from "@/components/provider-portal/portal-fetch";

const OFFER_STATUS = {
  SUBMITTED: { color: "info", label: "Submitted" },
  OPENED: { color: "info", label: "Opened" },
  WITHDRAWN: { color: "warning", label: "Withdrawn" },
  REJECTED: { color: "error", label: "Rejected" },
};
const INVOICE_STATUS = {
  RECEIVED: { color: "warning", label: "Received — pending review" },
  CERTIFIED: { color: "info", label: "Certified" },
  VERIFIED: { color: "info", label: "Verified" },
  APPROVED_FOR_PAYMENT: { color: "success", label: "Approved for payment" },
  REJECTED: { color: "error", label: "Rejected" },
  DRAFT: { color: "warning", label: "Draft" },
};
const PAYMENT_STATUS = {
  PENDING: { color: "warning", label: "Pending" },
  APPROVED: { color: "info", label: "Approved" },
  PAID: { color: "success", label: "Paid" },
  REJECTED: { color: "error", label: "Rejected" },
  CANCELLED: { color: "error", label: "Cancelled" },
};
const ORDER_KIND = {
  PURCHASE_INSTRUCTION: "Purchase instruction",
  LPO: "Local purchase order",
  CONTRACT: "Contract",
};

/**
 * @param {{ map: Record<string, { color: string; label: string }>; status: string }} p
 */
function StatusChip({ map, status }) {
  const s = map[status] || { color: "info", label: status };
  return <Chip size="small" color={/** @type {any} */ (s.color)} label={s.label} />;
}

/**
 * @param {{ loading: boolean; error: string; empty: boolean; emptyText: string; children: import("react").ReactNode }} p
 */
function ListState({ loading, error, empty, emptyText, children }) {
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
function OfferDialog({ opportunity, onClose, onSaved }) {
  const { showToast } = useToast();
  const existing = opportunity.myOffer && opportunity.canEdit ? opportunity.myOffer : null;
  const word = opportunity.type === "RFQ" ? "quotation" : "bid";
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [deliveryDays, setDeliveryDays] = useState(existing?.deliveryDays ? String(existing.deliveryDays) : "");
  const [remarks, setRemarks] = useState(existing?.remarks || "");
  /** @type {[Record<string, string>, Function]} */
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    /** @type {Record<string, string>} */
    const next = {};
    const amountErr = validatePositiveMoney(amount, "Amount");
    if (amountErr) next.amount = amountErr;
    if (deliveryDays.trim()) {
      const n = Number(deliveryDays);
      if (!Number.isInteger(n) || n < 1 || n > 730) next.deliveryDays = "Enter whole days between 1 and 730.";
    }
    setErrors(next);
    if (Object.keys(next).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        amount: parseMoneyInput(amount),
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
          <TextField
            label="Total price (UGX)"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setErrors((p) => ({ ...p, amount: "" }));
            }}
            error={Boolean(errors.amount)}
            helperText={errors.amount || "Your total offer price, inclusive of taxes"}
            inputMode="decimal"
            fullWidth
            autoFocus
          />
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
            You can edit or withdraw this {word} until the closing date.
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

export function PortalOpportunities() {
  const { showToast } = useToast();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [reloadKey, setReloadKey] = useState(0);
  const list = usePortalList("/api/provider-portal/opportunities", { page, pageSize, reloadKey });
  const [editing, setEditing] = useState(/** @type {any} */ (null));
  const [withdrawing, setWithdrawing] = useState(/** @type {any} */ (null));
  const [busy, setBusy] = useState(false);

  async function confirmWithdraw() {
    if (!withdrawing?.myOffer) return;
    setBusy(true);
    try {
      const { ok, data } = await portalFetch(`/api/provider-portal/offers/${withdrawing.myOffer.id}`, {
        method: "DELETE",
      });
      if (!ok) {
        showToast({ message: typeof data.error === "string" ? data.error : "Could not withdraw.", severity: "error" });
        return;
      }
      showToast({ message: "Your offer was withdrawn.", severity: "success" });
      setWithdrawing(null);
      setReloadKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

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
          {list.items.map((o) => (
            <li key={o.id} className={`${BRAND_CARD_CLASS} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold wrap-break-word">{o.title}</p>
                  <p className="text-xs text-zinc-600">
                    {o.type === "RFQ" ? "Request for quotation" : "Open tender"} · {o.procurement?.number}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {o.canSubmit ? (
                    <Tooltip title={o.type === "RFQ" ? "Submit quotation" : "Submit bid"}>
                      <IconButton
                        color="primary"
                        aria-label={o.type === "RFQ" ? "Submit quotation" : "Submit bid"}
                        onClick={() => setEditing(o)}
                      >
                        <SendRounded />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                  {o.canEdit ? (
                    <>
                      <Tooltip title="Edit offer">
                        <IconButton color="primary" aria-label="Edit offer" onClick={() => setEditing(o)}>
                          <EditRounded />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Withdraw offer">
                        <IconButton color="error" aria-label="Withdraw offer" onClick={() => setWithdrawing(o)}>
                          <UndoRounded />
                        </IconButton>
                      </Tooltip>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {o.accepting ? (
                  <Chip size="small" color="info" label={`Open until ${formatPortalDateTime(o.closingDate)}`} />
                ) : (
                  <Chip size="small" color="error" label="Closed" />
                )}
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
            </li>
          ))}
        </ul>
      </ListState>
      <Pager total={list.total} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />

      {editing ? (
        <OfferDialog
          key={editing.id}
          opportunity={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}

      <Dialog open={Boolean(withdrawing)} onClose={busy ? undefined : () => setWithdrawing(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Withdraw your offer?</DialogTitle>
        <DialogContent dividers>
          <p className="text-sm">
            Your offer for <span className="font-semibold">{withdrawing?.title}</span> will no longer be
            considered. You can submit a new one before the closing date.
          </p>
        </DialogContent>
        <DialogActions className="flex-wrap gap-2">
          <Button onClick={() => setWithdrawing(null)} disabled={busy}>
            Keep offer
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy}
            onClick={confirmWithdraw}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <UndoRounded />}
          >
            {busy ? "Withdrawing…" : "Withdraw"}
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Orders + invoice submission                                         */
/* ------------------------------------------------------------------ */

/**
 * @param {{ order: any; onClose: () => void; onSaved: () => void }} p
 */
function InvoiceDialog({ order, onClose, onSaved }) {
  const { showToast } = useToast();
  const [supplierReference, setSupplierReference] = useState("");
  const [amount, setAmount] = useState(String(order.remaining || ""));
  const [invoiceDate, setInvoiceDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  /** @type {[Record<string, string>, Function]} */
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    /** @type {Record<string, string>} */
    const next = {};
    if (!supplierReference.trim()) next.supplierReference = "Enter your invoice number.";
    const amountErr = validatePositiveMoney(amount, "Amount");
    if (amountErr) next.amount = amountErr;
    else if (Number(parseMoneyInput(amount)) > Number(order.remaining) + 0.009) {
      next.amount = `Cannot exceed the uninvoiced balance of ${formatMoneyUGX(order.remaining)}.`;
    }
    if (!invoiceDate) next.invoiceDate = "Enter the invoice date.";
    setErrors(next);
    if (Object.keys(next).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const { ok, data } = await portalFetch("/api/provider-portal/invoices", {
        method: "POST",
        body: JSON.stringify({
          procurementId: order.procurement?.id,
          supplierReference: supplierReference.trim(),
          amount: parseMoneyInput(amount),
          invoiceDate,
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
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form noValidate onSubmit={submit}>
        <DialogTitle>Submit invoice</DialogTitle>
        <DialogContent dividers className="space-y-3">
          <p className="text-sm text-zinc-700">
            {ORDER_KIND[order.kind]} <span className="font-semibold">{order.number}</span> · value{" "}
            {formatMoneyUGX(order.value)} · uninvoiced {formatMoneyUGX(order.remaining)}
          </p>
          <TextField
            label="Your invoice number"
            value={supplierReference}
            onChange={(e) => {
              setSupplierReference(e.target.value);
              setErrors((p) => ({ ...p, supplierReference: "" }));
            }}
            error={Boolean(errors.supplierReference)}
            helperText={errors.supplierReference || "As printed on your invoice"}
            fullWidth
            autoFocus
          />
          <TextField
            label="Amount (UGX)"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setErrors((p) => ({ ...p, amount: "" }));
            }}
            error={Boolean(errors.amount)}
            helperText={errors.amount || " "}
            inputMode="decimal"
            fullWidth
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
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
        </DialogContent>
        <DialogActions className="flex-wrap gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <ReceiptLongRounded />}
          >
            {busy ? "Submitting…" : "Submit invoice"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/**
 * @param {{ onInvoiced: () => void }} p
 */
export function PortalOrders({ onInvoiced }) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [reloadKey, setReloadKey] = useState(0);
  const list = usePortalList("/api/provider-portal/orders", { page, pageSize, reloadKey });
  const [invoicing, setInvoicing] = useState(/** @type {any} */ (null));

  return (
    <section aria-labelledby="pp-orders" className="space-y-3">
      <h2 id="pp-orders" className="text-base font-semibold text-primary">
        Orders
      </h2>
      <p className="text-sm text-zinc-600">
        Purchase instructions, local purchase orders and contracts issued to you. You can invoice once a
        delivery has passed inspection.
      </p>
      <ListState
        loading={list.loading}
        error={list.error}
        empty={!list.items.length}
        emptyText="No orders have been issued to you yet."
      >
        <ul className="space-y-3">
          {list.items.map((o) => (
            <li key={`${o.kind}-${o.id}`} className={`${BRAND_CARD_CLASS} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold wrap-break-word">
                    {ORDER_KIND[o.kind]} {o.number}
                  </p>
                  <p className="text-xs text-zinc-600 wrap-break-word">
                    {o.procurement?.number}
                    {o.procurement?.title ? ` · ${o.procurement.title}` : ""}
                  </p>
                </div>
                <Tooltip
                  title={
                    o.canInvoice
                      ? "Submit invoice"
                      : o.hasAcceptedDelivery
                        ? "Fully invoiced"
                        : "Available after a delivery passes inspection"
                  }
                >
                  <span>
                    <IconButton
                      color="success"
                      aria-label="Submit invoice"
                      disabled={!o.canInvoice}
                      onClick={() => setInvoicing(o)}
                    >
                      <ReceiptLongRounded />
                    </IconButton>
                  </span>
                </Tooltip>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <Chip size="small" color="info" label={o.status} />
                <span>
                  Value <span className="font-semibold">{formatMoneyUGX(o.value)}</span>
                </span>
                <span className="text-zinc-600">Invoiced {formatMoneyUGX(o.alreadyInvoiced)}</span>
                {o.issuedAt ? <span className="text-zinc-600">Issued {formatPortalDate(o.issuedAt)}</span> : null}
              </div>
              {o.deliveryAddress ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-zinc-700">
                  <PlaceRounded fontSize="inherit" aria-hidden /> Deliver to: {o.deliveryAddress}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </ListState>
      <Pager total={list.total} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
      {invoicing ? (
        <InvoiceDialog
          key={invoicing.id}
          order={invoicing}
          onClose={() => setInvoicing(null)}
          onSaved={() => {
            setInvoicing(null);
            setReloadKey((k) => k + 1);
            onInvoiced();
          }}
        />
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Invoices + payments                                                 */
/* ------------------------------------------------------------------ */

/**
 * @param {{ reloadKey: number }} p
 */
export function PortalInvoices({ reloadKey }) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const list = usePortalList("/api/provider-portal/invoices", { page, pageSize, reloadKey });

  return (
    <section aria-labelledby="pp-invoices" className="space-y-3">
      <h2 id="pp-invoices" className="text-base font-semibold text-primary">
        Invoices
      </h2>
      <ListState
        loading={list.loading}
        error={list.error}
        empty={!list.items.length}
        emptyText="No invoices yet. Submit one from an order once your delivery has passed inspection."
      >
        <ul className="space-y-3">
          {list.items.map((inv) => (
            <li key={inv.id} className={`${BRAND_CARD_CLASS} p-4`}>
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
                {inv.source === "OFFICER" ? <span className="text-zinc-600">Recorded by the procurement unit</span> : null}
              </div>
              {inv.rejectionReason ? (
                <Alert severity="error" variant="outlined" sx={{ mt: 1 }}>
                  {inv.rejectionReason}
                </Alert>
              ) : null}
            </li>
          ))}
        </ul>
      </ListState>
      <Pager total={list.total} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
    </section>
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
            <li key={p.id} className={`${BRAND_CARD_CLASS} p-4`}>
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
            </li>
          ))}
        </ul>
      </ListState>
      <Pager total={list.total} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
    </section>
  );
}
