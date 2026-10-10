"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import LockOpenRounded from "@mui/icons-material/LockOpenRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import { format, isValid } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import { actionConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { adminDialogPaperSx, themedTextFieldSx } from "@/lib/admin-mui-surfaces";

/** @param {unknown} value */
function toDate(value) {
  if (!value) return null;
  const d = new Date(/** @type {any} */ (value));
  return isValid(d) ? d : null;
}

/** @param {Date | null} d */
function inputValue(d) {
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : "";
}

/** @param {any} solicitation */
export function submissionsOpen(solicitation) {
  const closesAt = toDate(solicitation?.closingDate);
  return Boolean(closesAt) && closesAt.getTime() > Date.now();
}

/** @param {any} solicitation */
export function submissionsReopenable(solicitation) {
  return !solicitation?.openedAt && ["ISSUED", "ADVERTISED"].includes(solicitation?.status);
}

/**
 * @param {string} projectId
 * @param {string} taskId
 * @param {Record<string, any>} extra
 */
async function postTask(projectId, taskId, extra) {
  const res = await fetch(`/api/projects/${projectId}/tasks`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, decision: "COMPLETE", ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/**
 * Submissions state on the officer's receive step, with Close while open.
 * @param {{
 *   projectId: string;
 *   taskId: string;
 *   solicitation: any;
 *   isTender: boolean;
 *   busy: boolean;
 *   setBusy: (b: boolean) => void;
 *   onChanged: () => Promise<void> | void;
 * }} p
 */
export function OrgSubmissionWindow({ projectId, taskId, solicitation, isTender, busy, setBusy, onChanged }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const word = isTender ? "bids" : "quotations";
  const closesAt = toDate(solicitation?.closingDate);
  const open = submissionsOpen(solicitation);

  async function closeNow() {
    const ok = await confirm(
      actionConfirmOptions(`Close ${word}`, {
        message: closesAt ? `Closing date is ${format(closesAt, "MMM d, yyyy HH:mm")}. No more ${word} after this.` : null,
        color: "warning",
      }),
    );
    if (!ok) return;
    setBusy(true);
    try {
      const { ok: done, data } = await postTask(projectId, taskId, { lock: true });
      if (!done) {
        showToast({ message: typeof data.error === "string" ? data.error : `Could not close ${word}.`, severity: "error" });
        return;
      }
      showToast({ message: `${isTender ? "Bids" : "Quotations"} closed.`, severity: "success" });
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--border-subtle) p-3">
      <Chip
        size="small"
        color={open ? "info" : "success"}
        label={
          open
            ? `Open until ${format(closesAt, "MMM d, yyyy HH:mm")}`
            : `Closed${closesAt ? ` ${format(closesAt, "MMM d, yyyy HH:mm")}` : ""}`
        }
      />
      {open ? (
        <Button
          variant="outlined"
          color="warning"
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <LockRounded />}
          disabled={busy}
          onClick={() => void closeNow()}
          className="w-full sm:w-auto"
        >
          Close {word}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * New closing date for reopened submissions; defaults to the advertised closing date.
 * @param {{
 *   open: boolean;
 *   onClose: () => void;
 *   projectId: string;
 *   taskId: string;
 *   solicitation: any;
 *   isTender: boolean;
 *   busy: boolean;
 *   setBusy: (b: boolean) => void;
 *   onChanged: () => Promise<void> | void;
 * }} p
 */
export function OrgReopenSubmissionsDialog({ open, onClose, projectId, taskId, solicitation, isTender, busy, setBusy, onChanged }) {
  const { showToast } = useToast();
  const word = isTender ? "bids" : "quotations";
  const [closingDate, setClosingDate] = useState("");
  const [error, setError] = useState("");
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosingDate(inputValue(toDate(solicitation?.originalClosingDate) || toDate(solicitation?.closingDate)));
      setError("");
    }
  }

  /** @param {import("react").FormEvent} e */
  async function submit(e) {
    e.preventDefault();
    const d = closingDate ? new Date(closingDate) : null;
    if (!d || !isValid(d) || d.getTime() <= Date.now()) {
      setError("Choose a future date and time.");
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const { ok, data } = await postTask(projectId, taskId, { reopen: { closingDate: d.toISOString() } });
      if (!ok) {
        setError(data.fieldErrors?.closingDate || "");
        showToast({ message: typeof data.error === "string" ? data.error : `Could not reopen ${word}.`, severity: "error" });
        return;
      }
      showToast({ message: `${isTender ? "Bids" : "Quotations"} reopened.`, severity: "success" });
      onClose();
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: adminDialogPaperSx } }}
    >
      <form noValidate onSubmit={submit}>
        <DialogTitle>Reopen {word}</DialogTitle>
        <DialogContent dividers>
          <TextField
            label="New closing date"
            type="datetime-local"
            value={closingDate}
            onChange={(e) => {
              setClosingDate(e.target.value);
              setError("");
            }}
            error={Boolean(error)}
            helperText={error || " "}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
            sx={themedTextFieldSx}
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
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <LockOpenRounded />}
          >
            {busy ? "Reopening…" : `Reopen ${word}`}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
