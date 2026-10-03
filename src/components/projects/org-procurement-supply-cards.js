"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import EditLocationAltRounded from "@mui/icons-material/EditLocationAltRounded";
import PlaceRounded from "@mui/icons-material/PlaceRounded";
import ReceiptLongRounded from "@mui/icons-material/ReceiptLongRounded";
import { format, isValid, parseISO } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminDialogPaperSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { formatMoneyUGX, parseMoneyInput, validatePositiveMoney } from "@/lib/money";

const SOURCE_META = {
  OFFICER: { label: "Recorded by officer", color: "info" },
  PORTAL: { label: "Provider portal", color: "primary" },
  AUTO: { label: "Simulated provider", color: "warning" },
};

/** @param {{ source?: string | null }} p */
export function SubmissionSourceChip({ source }) {
  const meta = SOURCE_META[/** @type {keyof typeof SOURCE_META} */ (source || "OFFICER")] || SOURCE_META.OFFICER;
  return <Chip size="small" variant="outlined" color={/** @type {any} */ (meta.color)} label={meta.label} />;
}

const OFFER_STATUS_COLOR = { SUBMITTED: "info", OPENED: "primary", WITHDRAWN: "error", REJECTED: "error" };

/** @param {unknown} value */
function shortDate(value) {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : new Date(/** @type {any} */ (value));
  return isValid(d) ? format(d, "MMM d, yyyy") : "—";
}

/**
 * Received quotations / bids with where each came from.
 * @param {{ offers: any[]; providerWord: string }} p
 */
export function OrgOffersCard({ offers, providerWord }) {
  if (!offers.length) return null;
  const active = offers.filter((o) => o.status !== "WITHDRAWN");
  const lowest = active.reduce(
    (min, o) => (min === null || Number(o.amount) < Number(min.amount) ? o : min),
    /** @type {any} */ (null),
  );
  return (
    <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        Quotations / bids
      </Typography>
      <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 1.5 }}>
        {active.length} active of {offers.length} received. Offers come from the officer, the {providerWord}
        &apos;s own portal login, or simulated {providerWord}s responding automatically.
      </Typography>
      <ul className="space-y-2 text-sm">
        {offers.map((o) => (
          <li
            key={o.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-(--border-subtle) p-2"
          >
            <span className="font-semibold wrap-break-word">{o.supplier?.name || "—"}</span>
            <span>{formatMoneyUGX(o.amount)}</span>
            {o.deliveryDays ? <span className="opacity-80">· {o.deliveryDays} days</span> : null}
            <span className="opacity-70">· {shortDate(o.submittedAt)}</span>
            <Chip
              size="small"
              color={/** @type {any} */ (OFFER_STATUS_COLOR[o.status] || "info")}
              label={o.status}
            />
            <SubmissionSourceChip source={o.source} />
            {lowest && lowest.id === o.id && active.length > 1 ? (
              <Chip size="small" color="success" variant="outlined" label="Lowest price" />
            ) : null}
            {o.remarks ? <span className="w-full text-xs opacity-70">{o.remarks}</span> : null}
          </li>
        ))}
      </ul>
    </Paper>
  );
}

/**
 * Delivery address on an order document; editable while the LPO/contract is still in draft or approved.
 * @param {{
 *   address: string | null;
 *   fallback?: string | null;
 *   editableKind?: "lpo" | "contract" | null;
 *   busy?: boolean;
 *   onSave?: (kind: "lpo" | "contract", address: string) => Promise<boolean>;
 * }} p
 */
export function OrgDeliveryAddressLine({ address, fallback, editableKind, busy, onSave }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const { showToast } = useToast();
  const shown = address || fallback || "";

  async function save(e) {
    e.preventDefault();
    const trimmed = value.trim();
    let msg = "";
    if (!trimmed) msg = "Enter the delivery address.";
    else if (trimmed.length < 3) msg = "Delivery address is too short.";
    else if (trimmed.length > 255) msg = "Delivery address must be 255 characters or fewer.";
    if (msg) {
      setError(msg);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    if (!editableKind || !onSave) return;
    const ok = await onSave(editableKind, trimmed);
    if (ok) setOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <PlaceRounded fontSize="small" className="text-primary" aria-hidden />
      <span className="font-semibold">Deliver to:</span>
      <span className="wrap-break-word">{shown || "—"}</span>
      {!address && fallback ? <span className="text-xs opacity-70">(from the requisition)</span> : null}
      {editableKind && onSave ? (
        <Tooltip title="Correct the delivery address before the order is issued">
          <span>
            <IconButton
              size="small"
              color="primary"
              aria-label="Edit delivery address"
              disabled={busy}
              onClick={() => {
                setValue(shown);
                setError("");
                setOpen(true);
              }}
            >
              <EditLocationAltRounded fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      ) : null}
      <Dialog
        open={open}
        onClose={() => (busy ? null : setOpen(false))}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: adminDialogPaperSx }}
      >
        <form noValidate onSubmit={(e) => void save(e)}>
          <DialogTitle>Delivery address</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
              The corrected address is carried to the delivery, goods received note and invoice.
            </Typography>
            <TextField
              label="Delivery address"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError("");
              }}
              error={Boolean(error)}
              helperText={error || " "}
              fullWidth
              multiline
              minRows={2}
              autoFocus
              sx={themedTextFieldSx}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={busy}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {busy ? "Saving…" : "Save address"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </div>
  );
}

/**
 * Officer records an invoice handed over by the provider (paper / email).
 * @param {{
 *   order: { number: string; value: number; supplierName: string | null; deliveryAddress: string | null } | null;
 *   alreadyInvoiced: number;
 *   acceptedDeliveries: any[];
 *   providerWord: string;
 *   nextInvoiceNumber?: string | null;
 *   busy: boolean;
 *   onSubmit: (body: Record<string, any>) => Promise<boolean>;
 * }} p
 */
export function OrgReceiveInvoiceForm({
  order,
  alreadyInvoiced,
  acceptedDeliveries,
  providerWord,
  nextInvoiceNumber,
  busy,
  onSubmit,
}) {
  const { showToast } = useToast();
  const remaining = order ? Math.max(0, order.value - alreadyInvoiced) : 0;
  const [amount, setAmount] = useState(remaining ? String(remaining) : "");
  const [reference, setReference] = useState("");
  const [deliveryId, setDeliveryId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  /** @type {[Record<string, string>, Function]} */
  const [errors, setErrors] = useState({});

  if (!order) {
    return (
      <Typography variant="body2" sx={adminMutedTextSx}>
        An issued purchase instruction, accepted LPO or active contract is needed before an invoice can be received.
      </Typography>
    );
  }
  if (!acceptedDeliveries.length) {
    return (
      <Typography variant="body2" sx={adminMutedTextSx}>
        Record a delivery and pass inspection before receiving the {providerWord}&apos;s invoice.
      </Typography>
    );
  }

  async function submit(e) {
    e.preventDefault();
    /** @type {Record<string, string>} */
    const next = {};
    const amountErr = validatePositiveMoney(amount, "Invoice amount");
    if (amountErr) next.amount = amountErr;
    if (reference.trim().length > 64) next.supplierReference = "Use 64 characters or fewer.";
    if (!invoiceDate) next.invoiceDate = "Choose the invoice date.";
    setErrors(next);
    if (Object.keys(next).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    const ok = await onSubmit({
      amount: parseMoneyInput(amount),
      supplierReference: reference.trim() || null,
      deliveryId: deliveryId || null,
      invoiceDate,
      notes: notes.trim() || null,
    });
    if (ok) {
      setReference("");
      setNotes("");
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="space-y-3">
      <div className="grid gap-1 text-sm sm:grid-cols-2">
        <p>
          <span className="font-semibold">From:</span> {order.supplierName || "—"}
        </p>
        <p>
          <span className="font-semibold">Order:</span> {order.number} · {formatMoneyUGX(order.value)}
        </p>
        <p>
          <span className="font-semibold">Already invoiced:</span> {formatMoneyUGX(alreadyInvoiced)}
        </p>
        <p className="wrap-break-word">
          <span className="font-semibold">Delivered to:</span> {order.deliveryAddress || "—"}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Invoice number"
          value={nextInvoiceNumber || "Auto-generated"}
          helperText="Generated automatically"
          fullWidth
          InputProps={{ readOnly: true }}
          sx={themedTextFieldSx}
        />
        <TextField
          label={`${providerWord.charAt(0).toUpperCase()}${providerWord.slice(1)} reference (optional)`}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          error={Boolean(errors.supplierReference)}
          helperText={errors.supplierReference || "Number printed on their invoice, if any"}
          fullWidth
          sx={themedTextFieldSx}
        />
        <TextField
          label="Invoice amount (UGX)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={Boolean(errors.amount)}
          helperText={errors.amount || `Prefilled with the balance not yet invoiced (${formatMoneyUGX(remaining)})`}
          fullWidth
          inputProps={{ inputMode: "decimal" }}
          sx={themedTextFieldSx}
        />
        <TextField
          label="Invoice date"
          type="date"
          value={invoiceDate}
          onChange={(e) => setInvoiceDate(e.target.value)}
          error={Boolean(errors.invoiceDate)}
          helperText={errors.invoiceDate || " "}
          fullWidth
          InputLabelProps={{ shrink: true }}
          sx={themedTextFieldSx}
        />
        <TextField
          select
          label="Delivery (goods received)"
          value={deliveryId}
          onChange={(e) => setDeliveryId(e.target.value)}
          helperText="Defaults to the latest accepted delivery"
          fullWidth
          sx={themedTextFieldSx}
        >
          <MenuItem value="">Latest accepted delivery</MenuItem>
          {acceptedDeliveries.map((d) => (
            <MenuItem key={d.id} value={d.id}>
              {d.status} · {shortDate(d.deliveryDate)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          fullWidth
          multiline
          minRows={2}
          className="sm:col-span-2"
          sx={themedTextFieldSx}
        />
      </div>
      <Button
        type="submit"
        variant="contained"
        disabled={busy}
        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <ReceiptLongRounded />}
        className="w-full sm:w-auto"
      >
        {busy ? "Receiving invoice…" : `Receive invoice from ${providerWord}`}
      </Button>
    </form>
  );
}
