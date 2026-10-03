"use client";

import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import CancelRounded from "@mui/icons-material/CancelRounded";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";

/**
 * @param {{ qualification: any; size?: "small" | "medium" }} p
 */
export function ProviderQualificationChip({ qualification, size = "small" }) {
  if (!qualification) return null;
  const ok = Boolean(qualification.qualifies);
  const tip = ok
    ? qualification.warningCount
      ? "Meets all requirements (some documents expire soon)"
      : "Meets all requirements"
    : (qualification.failedReasons || []).join(" · ");
  return (
    <Tooltip title={tip}>
      <Chip
        size={size}
        color={ok ? "success" : "error"}
        icon={ok ? <CheckCircleRounded /> : <CancelRounded />}
        label={ok ? "Qualifies" : `Doesn't qualify (${qualification.failedCount})`}
      />
    </Tooltip>
  );
}

/**
 * @param {{ passed: boolean; warning?: boolean }} c
 */
export function checkIconFor(c) {
  if (!c.passed) return { Icon: CancelRounded, color: "error.main" };
  if (c.warning) return { Icon: WarningAmberRounded, color: "warning.dark" };
  return { Icon: CheckCircleRounded, color: "success.main" };
}

/**
 * Static result list of eligibility checks.
 * @param {{ checks: any[] }} p
 */
export function ProviderComplianceChecklist({ checks }) {
  if (!Array.isArray(checks) || checks.length === 0) return null;
  return (
    <ul className="divide-y divide-(--border-subtle)">
      {checks.map((c) => {
        const { Icon, color } = checkIconFor(c);
        return (
          <li key={c.key} className="flex items-start gap-3 py-2">
            <Icon fontSize="small" sx={{ color, mt: "2px" }} aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium">{c.label}</p>
              <p className={`text-xs ${c.passed && !c.warning ? "opacity-70" : "font-medium"}`}>
                {c.passed ? "" : "Failed: "}
                {c.reason}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
