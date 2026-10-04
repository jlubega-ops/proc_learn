"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import CancelRounded from "@mui/icons-material/CancelRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import LocalShippingRounded from "@mui/icons-material/LocalShippingRounded";
import RadioButtonUncheckedRounded from "@mui/icons-material/RadioButtonUncheckedRounded";
import ReceiptLongRounded from "@mui/icons-material/ReceiptLongRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import TaskAltRounded from "@mui/icons-material/TaskAltRounded";
import { format } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import { PrintButton } from "@/components/print/print-document";
import { PurchaseInstructionView } from "@/components/procurement/purchase-instruction-document";
import { PortalAssignmentPrint } from "@/components/provider-portal/portal-assignment-print";
import { PORTAL_NOTIFICATIONS_CHANGED } from "@/components/provider-portal/provider-portal-shell";
import {
  INVOICE_STATUS,
  InvoiceDialog,
  ORDER_KIND,
  PAYMENT_STATUS,
  StatusChip,
} from "@/components/provider-portal/provider-portal-sections";
import { formatPortalDate, portalFetch } from "@/components/provider-portal/portal-fetch";
import { DELIVERY_NOTE_STATUS_PRESENTATION } from "@/lib/projects/purchase-instruction-presentation";
import { formatMoneyUGX } from "@/lib/money";
import { BRAND_CARD_CLASS } from "@/lib/brand-ui";

const INSPECTION_STATUS = {
  PENDING: { color: "warning", label: "Awaiting inspection" },
  ACCEPTED: { color: "success", label: "Accepted" },
  PARTIAL: { color: "info", label: "Partly accepted" },
  REJECTED: { color: "error", label: "Rejected" },
};

function notifyBell() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PORTAL_NOTIFICATIONS_CHANGED));
}

/** @param {{ title: string; children: import("react").ReactNode; action?: import("react").ReactNode }} p */
function Card({ title, children, action = null }) {
  return (
    <section className={`${BRAND_CARD_CLASS} p-4`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** @param {{ steps: { key: string; label: string; done: boolean; current: boolean }[] }} p */
function StepTracker({ steps }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" aria-label="Progress">
      {steps.map((s) => (
        <li
          key={s.key}
          className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs ${
            s.done
              ? "border-green-200 bg-green-50 text-green-800"
              : s.current
                ? "border-brand-yellow bg-yellow-50 font-semibold text-zinc-900"
                : "border-zinc-200 text-zinc-500"
          }`}
          aria-current={s.current ? "step" : undefined}
        >
          {s.done ? (
            <CheckCircleRounded sx={{ fontSize: 16, color: "#16a34a" }} />
          ) : (
            <RadioButtonUncheckedRounded sx={{ fontSize: 16 }} />
          )}
          <span className="min-w-0 wrap-break-word">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * @param {{ procurementId: string; decision: "ACCEPT" | "DECLINE"; onClose: () => void; onDone: () => void }} p
 */
function RespondDialog({ procurementId, decision, onClose, onDone }) {
  const { showToast } = useToast();
  const accept = decision === "ACCEPT";
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const v = value.trim();
    if (!v) {
      setError(accept ? "Enter your name." : "Enter a reason.");
      return;
    }
    setBusy(true);
    try {
      const { ok, data } = await portalFetch(`/api/provider-portal/assignments/${procurementId}/respond`, {
        method: "POST",
        body: JSON.stringify(accept ? { decision, acceptedByName: v } : { decision, declineReason: v }),
      });
      if (!ok) {
        const fe = data.fieldErrors || {};
        if (fe.acceptedByName || fe.declineReason) setError(fe.acceptedByName || fe.declineReason);
        showToast({ message: typeof data.error === "string" ? data.error : "Could not save.", severity: "error" });
        return;
      }
      showToast({
        message: accept ? "Purchase instruction accepted." : "Purchase instruction declined.",
        severity: "success",
      });
      notifyBell();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form noValidate onSubmit={submit}>
        <DialogTitle>{accept ? "Accept purchase instruction" : "Decline purchase instruction"}</DialogTitle>
        <DialogContent dividers>
          <TextField
            label={accept ? "Accepted by (full name)" : "Reason"}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            error={Boolean(error)}
            helperText={error || " "}
            fullWidth
            autoFocus
            multiline={!accept}
            minRows={accept ? undefined : 3}
          />
        </DialogContent>
        <DialogActions className="flex-wrap gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color={accept ? "success" : "error"}
            disabled={busy}
            startIcon={
              busy ? <CircularProgress size={16} color="inherit" /> : accept ? <TaskAltRounded /> : <CancelRounded />
            }
          >
            {busy ? "Saving…" : accept ? "Accept" : "Decline"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/**
 * @param {{ procurementId: string; outstanding: any[]; onClose: () => void; onDone: () => void }} p
 */
function DeliveryNoteDialog({ procurementId, outstanding, onClose, onDone }) {
  const { showToast } = useToast();
  const open = outstanding.filter((l) => l.outstanding > 0);
  const [qtys, setQtys] = useState(() => Object.fromEntries(open.map((l) => [l.itemName, String(l.outstanding)])));
  const [dispatchedAt, setDispatchedAt] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [remarks, setRemarks] = useState("");
  /** @type {[Record<string, string>, Function]} */
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");

  async function submit(e) {
    e.preventDefault();
    /** @type {Record<string, string>} */
    const next = {};
    let any = false;
    for (const l of open) {
      const raw = String(qtys[l.itemName] ?? "").trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) next[`line:${l.itemName}`] = "Enter a valid quantity.";
      else if (n > l.outstanding + 1e-9) next[`line:${l.itemName}`] = `Max ${l.outstanding}.`;
      else if (n > 0) any = true;
    }
    if (!any && !Object.keys(next).length) next.lines = "Enter at least one quantity.";
    if (!dispatchedAt) next.dispatchedAt = "Enter the date.";
    else if (dispatchedAt > today) next.dispatchedAt = "Date cannot be in the future.";
    setErrors(next);
    if (Object.keys(next).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const { ok, data } = await portalFetch(`/api/provider-portal/assignments/${procurementId}/delivery-notes`, {
        method: "POST",
        body: JSON.stringify({
          dispatchedAt,
          remarks: remarks.trim() || null,
          lines: open.map((l) => ({ itemName: l.itemName, quantity: String(qtys[l.itemName] ?? "").trim() })),
        }),
      });
      if (!ok) {
        if (data.fieldErrors) setErrors(data.fieldErrors);
        showToast({ message: typeof data.error === "string" ? data.error : "Could not save.", severity: "error" });
        return;
      }
      showToast({ message: "Delivery note sent. Waiting for receipt.", severity: "success" });
      notifyBell();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <form noValidate onSubmit={submit}>
        <DialogTitle>Mark delivered</DialogTitle>
        <DialogContent dividers className="space-y-3">
          {errors.lines ? <Alert severity="error">{errors.lines}</Alert> : null}
          <ul className="space-y-2">
            {open.map((l) => {
              const key = `line:${l.itemName}`;
              return (
                <li
                  key={l.itemName}
                  className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-2 sm:flex-row sm:items-start"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium wrap-break-word">{l.itemName}</p>
                    <p className="text-xs text-zinc-600">
                      Ordered {l.ordered} · received {l.received} · outstanding {l.outstanding}
                      {l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ""}
                    </p>
                  </div>
                  <TextField
                    label="Quantity sent"
                    value={qtys[l.itemName] ?? ""}
                    onChange={(e) => {
                      setQtys((p) => ({ ...p, [l.itemName]: e.target.value }));
                      setErrors((p) => ({ ...p, [key]: "", lines: "" }));
                    }}
                    error={Boolean(errors[key])}
                    helperText={errors[key] || " "}
                    inputMode="decimal"
                    className="w-full sm:w-40"
                  />
                </li>
              );
            })}
          </ul>
          <TextField
            label="Dispatch date"
            type="date"
            value={dispatchedAt}
            onChange={(e) => {
              setDispatchedAt(e.target.value);
              setErrors((p) => ({ ...p, dispatchedAt: "" }));
            }}
            error={Boolean(errors.dispatchedAt)}
            helperText={errors.dispatchedAt || " "}
            fullWidth
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
          />
          <TextField
            label="Remarks (optional)"
            value={remarks}
            onChange={(e) => {
              setRemarks(e.target.value);
              setErrors((p) => ({ ...p, remarks: "" }));
            }}
            error={Boolean(errors.remarks)}
            helperText={errors.remarks || " "}
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
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <LocalShippingRounded />}
          >
            {busy ? "Sending…" : "Send delivery note"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** @param {{ procurementId: string }} p */
export function PortalAssignmentDetail({ procurementId }) {
  const [data, setData] = useState(/** @type {any} */ (null));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [respond, setRespond] = useState(/** @type {"ACCEPT" | "DECLINE" | null} */ (null));
  const [delivering, setDelivering] = useState(false);
  const [invoicing, setInvoicing] = useState(false);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    void portalFetch(`/api/provider-portal/assignments/${procurementId}`).then(({ ok, data: body }) => {
      if (cancelled) return;
      setLoading(false);
      if (ok) {
        setData(body);
        setError("");
      } else setError(typeof body.error === "string" ? body.error : "Could not load this assignment.");
    });
    return () => {
      cancelled = true;
    };
  }, [procurementId, reloadKey]);

  const backRow = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button component={Link} href="/provider-portal" startIcon={<ArrowBackRounded />}>
        Back to assignments
      </Button>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outlined"
          startIcon={loading ? <CircularProgress size={16} /> : <RefreshRounded />}
          onClick={() => {
            setLoading(true);
            reload();
          }}
          disabled={loading}
        >
          Refresh
        </Button>
        {data ? (
          <PrintButton fileName={`Order record ${data.order?.number || data.procurement.procurementNumber}`} />
        ) : null}
      </div>
    </div>
  );

  if (!data) {
    return (
      <div className="space-y-4">
        {backRow}
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <div className="flex items-center gap-2 py-8 text-sm text-zinc-600" role="status" aria-busy>
            <CircularProgress size={18} /> Loading…
          </div>
        )}
      </div>
    );
  }

  const { procurement, order, actions } = data;
  const pendingNote = data.deliveryNotes.find((n) => n.status === "SUBMITTED");

  return (
    <div className="space-y-4">
      {backRow}

      <section className={`${BRAND_CARD_CLASS} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{procurement.procurementNumber}</p>
            <h2 className="text-lg font-bold wrap-break-word">{procurement.title}</h2>
            <p className="text-xs text-zinc-600 wrap-break-word">
              {order ? `${ORDER_KIND[order.kind]} ${order.number} · ${formatMoneyUGX(order.value)}` : "Order not yet issued"}
              {procurement.deliveryLocation ? ` · Deliver to ${procurement.deliveryLocation}` : ""}
            </p>
          </div>
          <Chip color={data.status.color} label={data.status.label} />
        </div>
        <div className="mt-3">
          <StepTracker steps={data.steps} />
        </div>
        {actions.canRespond || actions.canDeliver || actions.canInvoice ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.canRespond ? (
              <>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<TaskAltRounded />}
                  onClick={() => setRespond("ACCEPT")}
                  className="w-full sm:w-auto"
                >
                  Accept
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<CancelRounded />}
                  onClick={() => setRespond("DECLINE")}
                  className="w-full sm:w-auto"
                >
                  Decline
                </Button>
              </>
            ) : null}
            {actions.canDeliver ? (
              <Button
                variant="contained"
                startIcon={<LocalShippingRounded />}
                onClick={() => setDelivering(true)}
                className="w-full sm:w-auto"
              >
                Mark delivered
              </Button>
            ) : null}
            {actions.canInvoice ? (
              <Button
                variant="contained"
                startIcon={<ReceiptLongRounded />}
                onClick={() => setInvoicing(true)}
                className="w-full sm:w-auto"
              >
                Submit invoice
              </Button>
            ) : null}
          </div>
        ) : null}
        {pendingNote ? (
          <Alert severity="warning" variant="outlined" sx={{ mt: 2 }}>
            Delivery note {pendingNote.noteNumber} is waiting to be received.
          </Alert>
        ) : null}
      </section>

      {data.purchaseInstructionDoc ? <PurchaseInstructionView doc={data.purchaseInstructionDoc} /> : null}

      {data.outstanding.length ? (
        <Card title="Items">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
                  <th className="py-2 pr-2">Item</th>
                  <th className="py-2 pr-2 text-right">Ordered</th>
                  <th className="py-2 pr-2 text-right">Received</th>
                  <th className="py-2 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {data.outstanding.map((l) => (
                  <tr key={l.itemName} className="border-b border-zinc-100">
                    <td className="py-2 pr-2">
                      {l.itemName}
                      {l.unitOfMeasure ? <span className="text-xs text-zinc-500"> ({l.unitOfMeasure})</span> : null}
                    </td>
                    <td className="py-2 pr-2 text-right">{l.ordered}</td>
                    <td className="py-2 pr-2 text-right">{l.received}</td>
                    <td className="py-2 text-right font-semibold">{l.outstanding}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {data.deliveryNotes.length ? (
        <Card title="Delivery notes">
          <ul className="space-y-2">
            {data.deliveryNotes.map((n) => {
              const s = DELIVERY_NOTE_STATUS_PRESENTATION[n.status] || { label: n.status, color: "info" };
              return (
                <li key={n.id} className="rounded-lg border border-zinc-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{n.noteNumber}</p>
                    <Chip size="small" color={s.color} label={s.label} />
                  </div>
                  <p className="text-xs text-zinc-600">Dispatched {formatPortalDate(n.dispatchedAt)}</p>
                  <p className="mt-1 text-xs wrap-break-word">
                    {n.lines.map((l) => `${l.itemName}: ${l.quantity}${l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ""}`).join(" · ")}
                  </p>
                  {n.remarks ? <p className="mt-1 text-xs text-zinc-600 wrap-break-word">{n.remarks}</p> : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {data.deliveries.length ? (
        <Card title="Receipts and inspection">
          <ul className="space-y-2">
            {data.deliveries.map((d) => (
              <li key={d.id} className="rounded-lg border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Received {formatPortalDate(d.deliveryDate)}</p>
                  <StatusChip map={INSPECTION_STATUS} status={d.inspection?.status || "PENDING"} />
                </div>
                <p className="mt-1 text-xs wrap-break-word">
                  {d.lines
                    .map(
                      (l) =>
                        `${l.itemName}: ${l.receivedQuantity} received` +
                        (d.inspection && d.inspection.status !== "PENDING"
                          ? `, ${l.acceptedQuantity} accepted, ${l.rejectedQuantity} rejected`
                          : ""),
                    )
                    .join(" · ")}
                </p>
                {d.inspection?.resultNotes ? (
                  <p className="mt-1 text-xs text-zinc-600 wrap-break-word">{d.inspection.resultNotes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {data.invoices.length ? (
        <Card title="Invoices">
          <ul className="space-y-2">
            {data.invoices.map((i) => (
              <li key={i.id} className="rounded-lg border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {i.invoiceNumber}
                    {i.supplierReference ? <span className="font-normal text-zinc-600"> · {i.supplierReference}</span> : null}
                  </p>
                  <StatusChip map={INVOICE_STATUS} status={i.status} />
                </div>
                <p className="text-xs text-zinc-600">
                  {formatMoneyUGX(i.amount)} · {formatPortalDate(i.invoiceDate)}
                </p>
                {i.rejectionReason ? (
                  <p className="mt-1 text-xs text-brand-red wrap-break-word">{i.rejectionReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {data.payments.length ? (
        <Card title="Payments">
          <ul className="space-y-2">
            {data.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 p-3">
                <p className="text-sm">
                  <span className="font-semibold">{formatMoneyUGX(p.amount)}</span>
                  <span className="text-xs text-zinc-600">
                    {p.paymentReference ? ` · ${p.paymentReference}` : ""}
                    {p.paymentDate ? ` · ${formatPortalDate(p.paymentDate)}` : ""}
                  </span>
                </p>
                <StatusChip map={PAYMENT_STATUS} status={p.status} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {data.history?.length ? (
        <Card title="History">
          <ol className="space-y-2">
            {data.history.map((h) => (
              <li key={h.id} className="rounded-lg border border-zinc-200 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">{h.action}</p>
                  <p className="text-xs text-zinc-600">{format(new Date(h.createdAt), "MMM d, yyyy HH:mm")}</p>
                </div>
                {h.actor || h.role ? (
                  <p className="text-xs text-zinc-600">{[h.actor, h.role].filter(Boolean).join(" · ")}</p>
                ) : null}
                {h.comment ? <p className="mt-1 text-xs wrap-break-word">{h.comment}</p> : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <PortalAssignmentPrint data={data} />

      {respond ? (
        <RespondDialog
          procurementId={procurementId}
          decision={respond}
          onClose={() => setRespond(null)}
          onDone={() => {
            setRespond(null);
            reload();
          }}
        />
      ) : null}
      {delivering ? (
        <DeliveryNoteDialog
          procurementId={procurementId}
          outstanding={data.outstanding}
          onClose={() => setDelivering(false)}
          onDone={() => {
            setDelivering(false);
            reload();
          }}
        />
      ) : null}
      {invoicing && order ? (
        <InvoiceDialog
          order={{
            kind: order.kind,
            number: order.number,
            value: actions.orderValue,
            remaining: actions.remaining,
            procurement: { id: procurement.id },
          }}
          onClose={() => setInvoicing(false)}
          onSaved={() => {
            setInvoicing(false);
            notifyBell();
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
