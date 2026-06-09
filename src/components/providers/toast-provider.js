"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { isClientSigningOut } from "@/lib/auth/client-sign-out";

/**
 * Toasts use only MUI **success** (green) and **error** (red). Do not pass `info` or `warning`.
 * @typedef {'success' | 'error'} ToastSeverity
 */

const ToastContext = createContext({
  /** @param {string | { message: string; severity?: ToastSeverity; duration?: number }} input */
  showToast: (_input) => {},
});

/**
 * @param {unknown} v
 * @returns {ToastSeverity}
 */
function normalizeToastSeverity(v) {
  return v === "success" ? "success" : "error";
}

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  /** @type {[ToastSeverity, import('react').Dispatch<import('react').SetStateAction<ToastSeverity>>]} */
  const [severity, setSeverity] = useState("success");
  const [duration, setDuration] = useState(6000);

  const showToast = useCallback((input) => {
    if (typeof window !== "undefined" && isClientSigningOut()) {
      const severity =
        typeof input === "string"
          ? "error"
          : input?.severity === "success"
            ? "success"
            : "error";
      if (severity === "error") return;
    }

    const payload =
      typeof input === "string"
        ? {
            message: String(input).trim() || "Something went wrong.",
            severity: /** @type {ToastSeverity} */ ("error"),
            duration: 6000,
          }
        : {
            message: String(input?.message ?? "").trim() || "Something went wrong.",
            severity: normalizeToastSeverity(input?.severity),
            duration:
              typeof input?.duration === "number" && input.duration > 0
                ? input.duration
                : 6000,
          };
    setMessage(payload.message);
    setSeverity(payload.severity);
    setDuration(payload.duration);
    setOpen(true);
  }, []);

  const handleClose = useCallback((_event, reason) => {
    if (reason === "clickaway") return;
    setOpen(false);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={duration}
        onClose={handleClose}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        sx={{ zIndex: (t) => t.zIndex.modal + 200 }}
      >
        <Alert
          onClose={() => setOpen(false)}
          severity={severity}
          variant="filled"
          elevation={6}
          sx={{ width: "100%", maxWidth: "min(100vw - 32px, 28rem)" }}
        >
          {message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}
