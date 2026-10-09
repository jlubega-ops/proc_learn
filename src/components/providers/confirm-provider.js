"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { adminDialogPaperSx, adminMutedTextSx } from "@/lib/admin-mui-surfaces";

/**
 * @typedef {{
 *   title: string;
 *   message?: string;
 *   confirmLabel?: string;
 *   cancelLabel?: string;
 *   color?: "primary" | "success" | "error" | "warning" | "info";
 * }} ConfirmOptions
 */

const ConfirmContext = createContext(
  /** @type {(opts: ConfirmOptions) => Promise<boolean>} */ (async () => true),
);

/** Ask the user to confirm an action before it is sent. Resolves `true` only on confirm. */
export function useConfirm() {
  return useContext(ConfirmContext);
}

const IRREVERSIBLE = "This cannot be undone.";

/**
 * Confirm options for a named action, e.g. `actionConfirmOptions("Issue LPO")` → "Issue LPO?".
 * @param {string} label
 * @param {{ color?: ConfirmOptions["color"]; message?: string | null }} [opts] `message: null` omits the line.
 * @returns {ConfirmOptions}
 */
export function actionConfirmOptions(label, opts = {}) {
  return {
    title: `${label}?`,
    message: opts.message === null ? undefined : opts.message || IRREVERSIBLE,
    confirmLabel: label,
    color: opts.color || "primary",
  };
}

/**
 * Confirm options for a workflow decision (APPROVE, RETURN, REJECT, …).
 * @param {string} decision
 * @param {string} [subject] e.g. "this budget"
 * @param {{ actionLabel?: string }} [opts] step-specific label for the positive action
 * @returns {ConfirmOptions}
 */
export function decisionConfirmOptions(decision, subject = "this record", opts = {}) {
  const d = String(decision || "").toUpperCase();
  if (d === "REJECT") {
    return { title: `Reject ${subject}?`, message: IRREVERSIBLE, confirmLabel: "Reject", color: "error" };
  }
  if (d === "RETURN") {
    return { title: `Return ${subject}?`, message: "It goes back for correction.", confirmLabel: "Return", color: "warning" };
  }
  if (d === "FLAG_EXCEPTION") {
    return { title: `Flag an exception on ${subject}?`, confirmLabel: "Flag exception", color: "warning" };
  }
  const label = opts.actionLabel?.trim();
  if (label) {
    return { title: `${label}?`, message: IRREVERSIBLE, confirmLabel: "Confirm", color: "primary" };
  }
  if (d === "APPROVE") {
    return { title: `Approve ${subject}?`, message: IRREVERSIBLE, confirmLabel: "Approve", color: "primary" };
  }
  if (d === "VERIFY") {
    return { title: `Verify ${subject}?`, message: IRREVERSIBLE, confirmLabel: "Verify", color: "primary" };
  }
  if (d === "SUBMIT") {
    return { title: `Submit ${subject}?`, message: IRREVERSIBLE, confirmLabel: "Submit", color: "primary" };
  }
  if (d === "SELECT_METHOD") {
    return { title: "Recommend this method?", message: IRREVERSIBLE, confirmLabel: "Recommend", color: "primary" };
  }
  return { title: `Complete this step on ${subject}?`, message: IRREVERSIBLE, confirmLabel: "Confirm", color: "primary" };
}

export function ConfirmProvider({ children }) {
  const [opts, setOpts] = useState(/** @type {ConfirmOptions | null} */ (null));
  const resolver = useRef(/** @type {((v: boolean) => void) | null} */ (null));

  const confirm = useCallback(
    /** @param {ConfirmOptions} next */
    (next) =>
      new Promise((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setOpts(next);
      }),
    [],
  );

  const settle = useCallback((/** @type {boolean} */ value) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog
        open={Boolean(opts)}
        onClose={() => settle(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
        aria-labelledby="app-confirm-title"
      >
        <DialogTitle id="app-confirm-title">{opts?.title}</DialogTitle>
        {opts?.message ? (
          <DialogContent>
            <Typography variant="body2" sx={adminMutedTextSx}>
              {opts.message}
            </Typography>
          </DialogContent>
        ) : null}
        <DialogActions className="flex-wrap gap-2">
          <Button onClick={() => settle(false)}>{opts?.cancelLabel || "Cancel"}</Button>
          <Button variant="contained" color={opts?.color || "primary"} onClick={() => settle(true)} autoFocus>
            {opts?.confirmLabel || "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
