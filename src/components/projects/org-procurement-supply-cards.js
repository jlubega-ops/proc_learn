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
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import EditLocationAltRounded from "@mui/icons-material/EditLocationAltRounded";
import PlaceRounded from "@mui/icons-material/PlaceRounded";
import { format, isValid, parseISO } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminDialogPaperSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { formatMoneyUGX } from "@/lib/money";

const SOURCE_META = {
  OFFICER: { label: "Recorded by officer", color: "info" },
  PORTAL: { label: "Provider portal", color: "primary" },
  AUTO: { label: "Auto-response provider", color: "warning" },
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
        &apos;s own portal login, or auto-response {providerWord}s.
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
