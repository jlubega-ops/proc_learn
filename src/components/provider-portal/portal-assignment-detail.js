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
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import TaskAltRounded from "@mui/icons-material/TaskAltRounded";
import { addDays, format } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import { actionConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { PrintButton } from "@/components/print/print-document";
import { PurchaseInstructionView } from "@/components/procurement/purchase-instruction-document";
import { PortalAssignmentPrint } from "@/components/provider-portal/portal-assignment-print";
import { WorkflowHistoryPanel } from "@/components/projects/workflow-history-panel";
import { PORTAL_NOTIFICATIONS_CHANGED } from "@/components/provider-portal/provider-portal-shell";
import {
  AWARD_STATUS,
  INVOICE_STATUS,
  SubmitInvoiceCard,
  ORDER_KIND,
  ORDER_STATUS,
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

/** @param {{ lines: any[]; total: unknown; caption: string }} p */
function PricedLines({ lines, total, caption }) {
  if (!lines.length) return null;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <caption className="pb-1 text-left text-xs font-semibold text-zinc-500">{caption}</caption>
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
            <th className="py-2 pr-2">Item</th>
            <th className="py-2 pr-2 text-right">Qty</th>
            <th className="py-2 pr-2 text-right">Unit price</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.lineNumber || l.itemName} className="border-b border-zinc-100">
              <td className="py-2 pr-2 wrap-break-word">{l.itemName}</td>
              <td className="py-2 pr-2 text-right">
                {l.quantity}
                {l.unitOfMeasure ? <span className="text-xs text-zinc-500"> {l.unitOfMeasure}</span> : null}
              </td>
              <td className="py-2 pr-2 text-right">{formatMoneyUGX(l.unitPrice)}</td>
              <td className="py-2 text-right">{formatMoneyUGX(l.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="py-2 pr-2 text-right font-semibold">
              Total
            </td>
            <td className="py-2 text-right font-semibold">{formatMoneyUGX(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** @param {{ steps: { key: string; label: string; done: boolean; current: boolean }[] }} p */
function StepTracker({ steps }) {
  return (
    <ol
      className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-(--steps)"
      style={/** @type {any} */ ({ "--steps": `repeat(${steps.length}, minmax(0, 1fr))` })}
      aria-label="Progress"
    >
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
 * @param {{
 *   procurementId: string;
 *   decision: "ACCEPT" | "DECLINE";
 *   target: "pi" | "award" | "order";
 *   orderKind?: string | null;
 *   onClose: () => void;
 *   onDone: () => void;
 * }} p
 */
function RespondDialog({ procurementId, decision, target, orderKind = null, onClose, onDone }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const accept = decision === "ACCEPT";
  const subject =
    target === "award"
      ? "award"
      : target === "order"
        ? orderKind === "CONTRACT"
          ? "contract"
          : "LPO"
        : "purchase instruction";
  const Subject = subject === "LPO" ? subject : subject[0].toUpperCase() + subject.slice(1);
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
    const confirmed = await confirm(
      accept
        ? actionConfirmOptions(`Accept ${subject}`, { color: "success" })
        : actionConfirmOptions(`Decline ${subject}`, { color: "error" }),
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      const { ok, data } = await portalFetch(`/api/provider-portal/assignments/${procurementId}/respond`, {
        method: "POST",
        body: JSON.stringify(
          accept ? { target, decision, acceptedByName: v } : { target, decision, declineReason: v },
        ),
      });
      if (!ok) {
        const fe = data.fieldErrors || {};
        if (fe.acceptedByName || fe.declineReason) setError(fe.acceptedByName || fe.declineReason);
        showToast({ message: typeof data.error === "string" ? data.error : "Could not save.", severity: "error" });
        return;
      }
      showToast({
        message: `${Subject} ${accept ? "accepted" : "declined"}.`,
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
        <DialogTitle>{`${accept ? "Accept" : "Decline"} ${subject}`}</DialogTitle>
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
 * @param {{
 *   procurementId: string;
 *   order: any;
 *   deliverTo: string | null;
 *   deliveryDays: number | null;
 *   outstanding: any[];
 *   onDone: () => void;
 * }} p
 */
function MakeDeliveryCard({ procurementId, order, deliverTo, deliveryDays, outstanding, onDone }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const open = outstanding.filter((l) => l.outstanding > 0);
  const [qtys, setQtys] = useState(() => Object.fromEntries(open.map((l) => [l.itemName, String(l.outstanding)])));
  const [dispatchedAt, setDispatchedAt] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [deliveredBy, setDeliveredBy] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [remarks, setRemarks] = useState("");
  /** @type {[Record<string, string>, Function]} */
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");
  const orderedFrom = order.acceptedAt || order.issuedAt;
  const deliverBy = deliveryDays && orderedFrom ? addDays(new Date(orderedFrom), deliveryDays) : null;
  const overdue = deliverBy ? format(deliverBy, "yyyy-MM-dd") < today : false;
  const sendingCount = open.filter((l) => Number(qtys[l.itemName]) > 0).length;

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
    if (!deliveredBy.trim()) next.deliveredBy = "Enter who is delivering.";
    else if (deliveredBy.trim().length > 160) next.deliveredBy = "Max 160 characters.";
    if (vehicleNumber.trim().length > 32) next.vehicleNumber = "Max 32 characters.";
    setErrors(next);
    if (Object.keys(next).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    if (!(await confirm(actionConfirmOptions("Send delivery note")))) return;
    setBusy(true);
    try {
      const { ok, data } = await portalFetch(`/api/provider-portal/assignments/${procurementId}/delivery-notes`, {
        method: "POST",
        body: JSON.stringify({
          dispatchedAt,
          deliveredBy: deliveredBy.trim(),
          vehicleNumber: vehicleNumber.trim() || null,
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
    <Card
      title="Make delivery"
      action={
        deliverBy ? (
          <Chip
            size="small"
            variant="outlined"
            color={overdue ? "error" : "info"}
            label={`${overdue ? "Overdue since" : "Deliver by"} ${format(deliverBy, "MMM d, yyyy")}`}
          />
        ) : null
      }
    >
      <form noValidate onSubmit={submit} className="space-y-4" aria-busy={busy}>
        <dl className="grid gap-3 rounded-lg border border-zinc-200 p-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-zinc-500">Against</dt>
            <dd className="font-semibold">
              {ORDER_KIND[order.kind]} {order.number}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Delivery period</dt>
            <dd>{deliveryDays ? `${deliveryDays} days from acceptance` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Deliver to</dt>
            <dd className="wrap-break-word">{deliverTo || "—"}</dd>
          </div>
        </dl>

        <div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <caption className="pb-1 text-left text-xs font-semibold text-zinc-500">Items to deliver</caption>
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
                  <th className="py-2 pr-2">Item</th>
                  <th className="py-2 pr-2 text-right">Ordered</th>
                  <th className="py-2 pr-2 text-right">Received</th>
                  <th className="py-2 pr-2 text-right">Outstanding</th>
                  <th className="w-40 py-2 text-right">Sending now</th>
                </tr>
              </thead>
              <tbody>
                {open.map((l) => {
                  const key = `line:${l.itemName}`;
                  return (
                    <tr key={l.itemName} className="border-b border-zinc-100 align-top">
                      <td className="py-2 pr-2 wrap-break-word">
                        {l.itemName}
                        {l.unitOfMeasure ? <span className="text-xs text-zinc-500"> ({l.unitOfMeasure})</span> : null}
                      </td>
                      <td className="py-2 pr-2 text-right">{l.ordered}</td>
                      <td className="py-2 pr-2 text-right">{l.received}</td>
                      <td className="py-2 pr-2 text-right font-semibold">{l.outstanding}</td>
                      <td className="py-1">
                        <TextField
                          value={qtys[l.itemName] ?? ""}
                          onChange={(e) => {
                            setQtys((p) => ({ ...p, [l.itemName]: e.target.value }));
                            setErrors((p) => ({ ...p, [key]: "", lines: "" }));
                          }}
                          error={Boolean(errors[key])}
                          helperText={errors[key] || "0 to skip"}
                          fullWidth
                          slotProps={{
                            htmlInput: {
                              inputMode: "decimal",
                              "aria-label": `Quantity sending now: ${l.itemName}`,
                              style: { textAlign: "right" },
                            },
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {errors.lines ? (
            <Alert severity="error" sx={{ mt: 1 }}>
              {errors.lines}
            </Alert>
          ) : null}
        </div>

        <div className="grid gap-x-3 sm:grid-cols-3">
          <TextField
            label="Delivered by"
            value={deliveredBy}
            onChange={(e) => {
              setDeliveredBy(e.target.value);
              setErrors((p) => ({ ...p, deliveredBy: "" }));
            }}
            error={Boolean(errors.deliveredBy)}
            helperText={errors.deliveredBy || "Driver or representative"}
            fullWidth
          />
          <TextField
            label="Vehicle no."
            value={vehicleNumber}
            onChange={(e) => {
              setVehicleNumber(e.target.value);
              setErrors((p) => ({ ...p, vehicleNumber: "" }));
            }}
            error={Boolean(errors.vehicleNumber)}
            helperText={errors.vehicleNumber || "Optional"}
            fullWidth
          />
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
        </div>
        <TextField
          label="Remarks"
          value={remarks}
          onChange={(e) => {
            setRemarks(e.target.value);
            setErrors((p) => ({ ...p, remarks: "" }));
          }}
          error={Boolean(errors.remarks)}
          helperText={errors.remarks || "Optional"}
          fullWidth
          multiline
          minRows={2}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs text-zinc-600" aria-live="polite">
            {sendingCount} of {open.length} item{open.length === 1 ? "" : "s"}
          </span>
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <LocalShippingRounded />}
            className="w-full sm:w-auto"
          >
            {busy ? "Sending…" : "Send delivery note"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** @param {{ procurementId: string }} p */
export function PortalAssignmentDetail({ procurementId }) {
  const [data, setData] = useState(/** @type {any} */ (null));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [respond, setRespond] = useState(
    /** @type {{ decision: "ACCEPT" | "DECLINE"; target: "pi" | "award" | "order" } | null} */ (null),
  );
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
        {data ? (
          <PrintButton
            fileName={
              data.order
                ? `Order record ${data.order.number}`
                : `${data.award ? "Award notice" : "Assignment"} ${data.procurement.procurementNumber}`
            }
          />
        ) : null}
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
  const orderDoc = order && order.kind !== "PURCHASE_INSTRUCTION" ? order : null;
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
          <Chip variant="outlined" color={data.status.color} label={data.status.label} />
        </div>
        <div className="mt-3">
          <StepTracker steps={data.steps} />
        </div>
        {actions.canRespond ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.canRespond ? (
              <>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<TaskAltRounded />}
                  onClick={() => setRespond({ decision: "ACCEPT", target: "pi" })}
                  className="w-full sm:w-auto"
                >
                  Accept
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<CancelRounded />}
                  onClick={() => setRespond({ decision: "DECLINE", target: "pi" })}
                  className="w-full sm:w-auto"
                >
                  Decline
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
        {pendingNote ? (
          <Alert severity="warning" variant="outlined" sx={{ mt: 2 }}>
            Delivery note {pendingNote.noteNumber} is waiting to be received.
          </Alert>
        ) : null}
      </section>

      {actions.canDeliver && order ? (
        <MakeDeliveryCard
          procurementId={procurementId}
          order={order}
          deliverTo={order.deliveryAddress || procurement.deliveryLocation || null}
          deliveryDays={data.award?.deliveryDays || null}
          outstanding={data.outstanding}
          onDone={reload}
        />
      ) : null}

      {actions.canInvoice && order ? (
        <SubmitInvoiceCard
          order={{
            kind: order.kind,
            number: order.number,
            value: actions.orderValue,
            invoiced: actions.invoiced,
            invoiceable: actions.invoiceable,
            invoiceNumber: actions.nextInvoiceNumber,
            procurement: { id: procurement.id },
            procurementNumber: procurement.procurementNumber,
            title: procurement.title,
            deliveryLocation: order.deliveryAddress || procurement.deliveryLocation,
            organisation: data.organisation,
            provider: data.provider,
            acceptedItems: Object.values(
              data.deliveries
                .filter((d) => d.inspection)
                .flatMap((d) => d.lines)
                .reduce((acc, l) => {
                  const priced = (data.award?.lines || []).find((al) => al.itemName === l.itemName);
                  const prev = acc[l.itemName] || {
                    itemName: l.itemName,
                    quantity: 0,
                    unitOfMeasure: l.unitOfMeasure,
                    unitPrice: priced?.unitPrice || 0,
                  };
                  acc[l.itemName] = { ...prev, quantity: prev.quantity + (Number(l.acceptedQuantity) || 0) };
                  return acc;
                }, /** @type {Record<string, any>} */ ({})),
            ).filter((it) => it.quantity > 0),
          }}
          onSaved={() => {
            notifyBell();
            reload();
          }}
        />
      ) : null}

      {orderDoc ? (
        <Card title={ORDER_KIND[orderDoc.kind]} action={<StatusChip map={ORDER_STATUS} status={orderDoc.status} />}>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-zinc-500">{orderDoc.kind === "CONTRACT" ? "Contract no." : "LPO no."}</dt>
              <dd className="font-semibold">{orderDoc.number}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Value</dt>
              <dd className="font-semibold">{formatMoneyUGX(orderDoc.value)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Issued by</dt>
              <dd className="wrap-break-word">{data.organisation?.name || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Issued on</dt>
              <dd>{formatPortalDate(orderDoc.issuedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Delivery period</dt>
              <dd>{data.award?.deliveryDays ? `${data.award.deliveryDays} days` : "—"}</dd>
            </div>
            {orderDoc.startDate || orderDoc.endDate ? (
              <div>
                <dt className="text-xs text-zinc-500">Contract period</dt>
                <dd>
                  {formatPortalDate(orderDoc.startDate)} – {formatPortalDate(orderDoc.endDate)}
                </dd>
              </div>
            ) : null}
            <div className="sm:col-span-3">
              <dt className="text-xs text-zinc-500">Deliver to</dt>
              <dd className="wrap-break-word">{orderDoc.deliveryAddress || procurement.deliveryLocation || "—"}</dd>
            </div>
            {orderDoc.acceptedAt ? (
              <div className="sm:col-span-3">
                <dt className="text-xs text-zinc-500">Accepted by</dt>
                <dd className="wrap-break-word">
                  {orderDoc.acceptedByName || "—"} · {formatPortalDate(orderDoc.acceptedAt)}
                </dd>
              </div>
            ) : null}
            {orderDoc.declinedAt ? (
              <div className="sm:col-span-3">
                <dt className="text-xs text-zinc-500">Declined on {formatPortalDate(orderDoc.declinedAt)}</dt>
                <dd className="wrap-break-word text-brand-red">{orderDoc.declineReason || "—"}</dd>
              </div>
            ) : null}
          </dl>
          <PricedLines lines={data.award?.lines || []} total={orderDoc.value} caption="Order lines" />
          {actions.canRespondOrder ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="contained"
                color="success"
                startIcon={<TaskAltRounded />}
                onClick={() => setRespond({ decision: "ACCEPT", target: "order" })}
                className="w-full sm:w-auto"
              >
                {orderDoc.kind === "CONTRACT" ? "Accept contract" : "Accept LPO"}
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<CancelRounded />}
                onClick={() => setRespond({ decision: "DECLINE", target: "order" })}
                className="w-full sm:w-auto"
              >
                {orderDoc.kind === "CONTRACT" ? "Decline contract" : "Decline LPO"}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {data.award ? (
        <Card
          title="Award"
          action={<StatusChip map={AWARD_STATUS} status={data.award.status} />}
        >
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            {orderDoc ? null : (
              <>
                <div>
                  <dt className="text-xs text-zinc-500">Awarded by</dt>
                  <dd className="wrap-break-word">{data.organisation?.name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Award amount</dt>
                  <dd className="font-semibold">{formatMoneyUGX(data.award.amount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Delivery period</dt>
                  <dd>{data.award.deliveryDays ? `${data.award.deliveryDays} days` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Deliver to</dt>
                  <dd className="wrap-break-word">{procurement.deliveryLocation || "—"}</dd>
                </div>
              </>
            )}
            <div>
              <dt className="text-xs text-zinc-500">Award date</dt>
              <dd>{formatPortalDate(data.award.awardDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Notified on</dt>
              <dd>{formatPortalDate(data.award.communicatedAt)}</dd>
            </div>
            {data.award.approvalReference ? (
              <div>
                <dt className="text-xs text-zinc-500">Approval reference</dt>
                <dd className="wrap-break-word">{data.award.approvalReference}</dd>
              </div>
            ) : null}
            {data.award.acceptedAt ? (
              <div>
                <dt className="text-xs text-zinc-500">Accepted by</dt>
                <dd className="wrap-break-word">
                  {data.award.acceptedByName || "—"} · {formatPortalDate(data.award.acceptedAt)}
                </dd>
              </div>
            ) : null}
            {data.award.declinedAt ? (
              <div className="sm:col-span-3">
                <dt className="text-xs text-zinc-500">Declined on {formatPortalDate(data.award.declinedAt)}</dt>
                <dd className="wrap-break-word text-brand-red">{data.award.declineReason || "—"}</dd>
              </div>
            ) : null}
          </dl>
          {orderDoc ? null : (
            <PricedLines lines={data.award.lines} total={data.award.amount} caption="Awarded items" />
          )}
          {actions.canRespondAward ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="contained"
                color="success"
                startIcon={<TaskAltRounded />}
                onClick={() => setRespond({ decision: "ACCEPT", target: "award" })}
                className="w-full sm:w-auto"
              >
                Accept award
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<CancelRounded />}
                onClick={() => setRespond({ decision: "DECLINE", target: "award" })}
                className="w-full sm:w-auto"
              >
                Decline award
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {data.purchaseInstructionDoc ? <PurchaseInstructionView doc={data.purchaseInstructionDoc} /> : null}

      {!actions.canDeliver && order && ["ACCEPTED", "ACTIVE"].includes(order.status) && data.outstanding.length ? (
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
                  <p className="text-xs text-zinc-600 wrap-break-word">
                    Dispatched {formatPortalDate(n.dispatchedAt)}
                    {n.deliveredBy ? ` · by ${n.deliveredBy}` : ""}
                    {n.vehicleNumber ? ` · ${n.vehicleNumber}` : ""}
                  </p>
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

      <WorkflowHistoryPanel
        history={(data.history || []).map((h) => ({
          id: h.id,
          createdAt: h.createdAt,
          actionLabel: h.action,
          actorName: h.actor,
          actorRoleName: h.role,
          comment: h.comment,
        }))}
      />

      <PortalAssignmentPrint data={data} />

      {respond ? (
        <RespondDialog
          procurementId={procurementId}
          decision={respond.decision}
          target={respond.target}
          orderKind={order?.kind || null}
          onClose={() => setRespond(null)}
          onDone={() => {
            setRespond(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
