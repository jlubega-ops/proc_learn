"use client";

import VisibilityRounded from "@mui/icons-material/VisibilityRounded";

/**
 * Hides a procurement section the viewer has no right to see, and makes it view-only
 * (native disabled fieldset) when they can see it but not act on it.
 * @param {{ access?: { view: boolean; act: boolean; reason: string } | null; children: import("react").ReactNode }} p
 */
export function ProcurementSectionGate({ access, children }) {
  if (!access) return <>{children}</>;
  if (!access.view) return null;
  if (access.act) return <>{children}</>;
  return (
    <fieldset
      disabled
      className="m-0 min-w-0 border-0 p-0 [&_[role=combobox]]:pointer-events-none [&_button]:opacity-60"
    >
      <legend className="sr-only">View only</legend>
      <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-primary">
        <VisibilityRounded sx={{ fontSize: 16 }} aria-hidden />
        View only — {access.reason}
      </div>
      {children}
    </fieldset>
  );
}
