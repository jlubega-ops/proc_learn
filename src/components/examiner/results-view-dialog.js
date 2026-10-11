"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import ScoreboardRounded from "@mui/icons-material/ScoreboardRounded";
import ListAltRounded from "@mui/icons-material/ListAltRounded";
import { adminDialogPaperSx } from "@/lib/admin-mui-surfaces";

const OPTIONS = [
  {
    value: "SUMMARY",
    label: "Overview",
    hint: "Score only, e.g. 30/100.",
    Icon: ScoreboardRounded,
  },
  {
    value: "DETAILS",
    label: "Full details",
    hint: "Score plus marks per section and item.",
    Icon: ListAltRounded,
  },
];

/**
 * Pick "SUMMARY" (overview) or "DETAILS" (full results).
 * @param {{
 *   open: boolean;
 *   title: string;
 *   confirmLabel: string;
 *   initialView?: string;
 *   busy?: boolean;
 *   onClose: () => void;
 *   onConfirm: (view: "SUMMARY" | "DETAILS") => void;
 * }} props
 */
export function ResultsViewDialog({ open, title, confirmLabel, initialView, busy, onClose, onConfirm }) {
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: adminDialogPaperSx } }}
      aria-labelledby="results-view-title"
    >
      <DialogTitle id="results-view-title">{title}</DialogTitle>
      {open ? (
        <ResultsViewChoice
          confirmLabel={confirmLabel}
          initialView={initialView}
          busy={busy}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      ) : null}
    </Dialog>
  );
}

/**
 * @param {{
 *   confirmLabel: string;
 *   initialView?: string;
 *   busy?: boolean;
 *   onClose: () => void;
 *   onConfirm: (view: "SUMMARY" | "DETAILS") => void;
 * }} props
 */
function ResultsViewChoice({ confirmLabel, initialView, busy, onClose, onConfirm }) {
  const [view, setView] = useState(initialView === "DETAILS" ? "DETAILS" : "SUMMARY");

  return (
    <>
      <DialogContent>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Results view">
          {OPTIONS.map(({ value, label, hint, Icon }) => {
            const active = view === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={busy}
                onClick={() => setView(value)}
                className={`flex w-full cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed ${
                  active
                    ? "border-primary bg-[var(--nav-active-bg)]"
                    : "border-zinc-200 hover:border-primary dark:border-zinc-700"
                }`}
              >
                <Icon className={active ? "text-primary" : "text-zinc-500"} fontSize="small" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{label}</span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
      <DialogActions className="flex-wrap gap-2">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="primary"
          disabled={busy}
          onClick={() => onConfirm(/** @type {"SUMMARY" | "DETAILS"} */ (view))}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </>
  );
}
