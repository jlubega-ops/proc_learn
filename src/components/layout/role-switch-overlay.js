"use client";

import CircularProgress from "@mui/material/CircularProgress";

/**
 * Full-screen wait overlay. Pass `active` from session blocking state.
 * @param {{ active?: boolean; message?: string }} props
 */
export function RoleSwitchOverlay({ active = false, message = "" }) {
  if (!active) return null;

  const label =
    typeof message === "string" && message.trim() ? message.trim() : "Please wait…";

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-3 bg-black/35 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <CircularProgress size={44} thickness={4} sx={{ color: "var(--brand-blue)" }} />
      <p className="max-w-[min(90vw,20rem)] text-center text-base font-semibold text-white drop-shadow-md">
        {label}
      </p>
    </div>
  );
}
