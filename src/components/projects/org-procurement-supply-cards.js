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
import { useDraftSync } from "@/hooks/use-draft-sync";
import {
  adminDialogPaperSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { formatMoneyUGX } from "@/lib/money";
import { OfferClarificationThread, OfferClarifyButton } from "@/components/projects/org-offer-clarification";

/** Non-portal submissions (officer shortcut or auto-response) show as Generated. */
const SOURCE_META = {
  OFFICER: { label: "Generated", color: "warning" },
  PORTAL: { label: "Provider portal", color: "primary" },
  AUTO: { label: "Generated", color: "warning" },
};

/** @param {{ source?: string | null }} p */
export function SubmissionSourceChip({ source }) {
  const meta = SOURCE_META[/** @type {keyof typeof SOURCE_META} */ (source || "OFFICER")] || SOURCE_META.OFFICER;
  return <Chip size="small" variant="outlined" color={/** @type {any} */ (meta.color)} label={meta.label} />;
}

const OFFER_STATUS = {
  SUBMITTED: { label: "Received", color: "info" },
  OPENED: { label: "Opened", color: "primary" },
  WITHDRAWN: { label: "Withdrawn", color: "error" },
  REJECTED: { label: "Rejected", color: "error" },
  LATE: { label: "Late — not accepted", color: "error" },
};
const INACTIVE = new Set(["WITHDRAWN", "LATE", "REJECTED"]);

/** @param {unknown} value */
function shortDate(value) {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : new Date(/** @type {any} */ (value));
  return isValid(d) ? format(d, "MMM d, yyyy") : "—";
}

/**
 * Received quotations / bids with where each came from.
 * @param {{
 *   offers: any[];
 *   providerWord: string;
 *   projectId?: string;
 *   procurementId?: string;
 *   clarifyAllowed?: boolean;
 *   onChanged?: () => Promise<void> | void;
 * }} p
 */
export function OrgOffersCard({ offers, providerWord, projectId, procurementId, clarifyAllowed = false, onChanged }) {
  if (!offers.length) return null;
  const active = offers.filter((o) => !INACTIVE.has(o.status));
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
        {active.length} valid of {offers.length} from {providerWord}s
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
              color={/** @type {any} */ (OFFER_STATUS[o.status]?.color || "info")}
              label={OFFER_STATUS[o.status]?.label || o.status}
            />
            <SubmissionSourceChip source={o.source} />
            {lowest && lowest.id === o.id && active.length > 1 ? (
              <Chip size="small" color="success" variant="outlined" label="Lowest price" />
            ) : null}
            {projectId && procurementId && onChanged && (clarifyAllowed || o.clarifications?.length) ? (
              <OfferClarifyButton
                projectId={projectId}
                procurementId={procurementId}
                offer={o}
                allowed={clarifyAllowed}
                onChanged={onChanged}
              />
            ) : null}
            {o.lineItems?.length ? (
              <details className="w-full text-xs">
                <summary className="cursor-pointer text-primary">Price breakdown</summary>
                <div className="mt-1 overflow-x-auto">
                  <table className="w-full min-w-[360px] border-collapse">
                    <tbody>
                      {o.lineItems.map((l) => (
                        <tr key={l.lineNumber} className="border-b border-(--border-subtle)">
                          <td className="py-1 pr-2">{l.itemName}</td>
                          <td className="py-1 pr-2 text-right">
                            {l.quantity} {l.unitOfMeasure || ""} × {formatMoneyUGX(l.unitPrice)}
                          </td>
                          <td className="py-1 text-right font-medium">{formatMoneyUGX(l.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}
            {o.remarks ? <span className="w-full text-xs opacity-70">{o.remarks}</span> : null}
            <OfferClarificationThread clarifications={o.clarifications} />
          </li>
        ))}
      </ul>
    </Paper>
  );
}

/**
 * Providers an RFQ was issued to, with where each stands.
 * @param {{ invites: any[]; offers: any[]; providerWordPlural: string }} p
 */
export function OrgInvitedProvidersList({ invites, offers, providerWordPlural }) {
  const offerBySupplier = new Map(
    offers.filter((o) => o.status !== "WITHDRAWN").map((o) => [o.supplierId, o]),
  );
  return (
    <div className="mb-3">
      <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block", mb: 0.5 }}>
        Invited {providerWordPlural} ({invites.length})
      </Typography>
      <ul className="divide-y divide-(--border-subtle) rounded-lg border border-(--border-subtle) text-sm">
        {invites.map((i) => {
          const offer = offerBySupplier.get(i.supplierId);
          /** @type {{ label: string; color: any }} */
          const state = offer
            ? OFFER_STATUS[offer.status] || { label: offer.status, color: "info" }
            : i.noResponseAt
              ? { label: "No response", color: "error" }
              : { label: "Awaiting", color: "warning" };
          return (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0">
                <span className="font-semibold wrap-break-word">{i.supplier?.name || "—"}</span>
                <span className="text-xs opacity-70"> · invited {shortDate(i.invitedAt)}</span>
              </span>
              <Chip size="small" color={state.color} label={state.label} />
            </li>
          );
        })}
      </ul>
    </div>
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
  const addressDraft = useDraftSync(
    `org:delivery-address:${editableKind || ""}:${shown}`,
    { value },
    (d) => {
      if (typeof d.value === "string") setValue(d.value);
    },
    { enabled: open },
  );

  function handleCancel() {
    if (busy) return;
    addressDraft.clearDraft();
    setOpen(false);
  }

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
    if (ok) {
      addressDraft.clearDraft();
      setOpen(false);
    }
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
        onClose={handleCancel}
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
            <Button onClick={handleCancel} disabled={busy}>
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
