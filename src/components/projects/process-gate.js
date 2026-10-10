"use client";

import Tooltip from "@mui/material/Tooltip";

/**
 * Wraps a control that must be disabled while its engine process is inactive.
 * Disabled MUI buttons swallow hover events, so the tooltip sits on a wrapper span.
 *
 * @param {{ inactive: boolean; title: string; className?: string; children: import("react").ReactNode }} p
 */
export function ProcessGateTooltip({ inactive, title, className, children }) {
  if (!inactive) return <>{children}</>;
  return (
    <Tooltip title={title}>
      <span className={className} style={{ display: "inline-flex", cursor: "not-allowed" }}>
        {children}
      </span>
    </Tooltip>
  );
}
