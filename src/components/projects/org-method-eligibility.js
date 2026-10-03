"use client";

import Chip from "@mui/material/Chip";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import BlockRounded from "@mui/icons-material/BlockRounded";
import { formatMoneyUGX } from "@/lib/money";
import { checkMethodValueCeiling } from "@/lib/projects/procurement-thresholds";

const METHODS = [
  { value: "MICRO", label: "Micro" },
  { value: "QUOTATION", label: "Quotation" },
  { value: "TENDER", label: "Tender" },
];

/**
 * @param {unknown} method
 * @param {unknown} value
 */
export function methodAllowedForValue(method, value) {
  return checkMethodValueCeiling(String(method || ""), value).ok;
}

/**
 * Funding and method fit for a requisition, shown before Form 5 Part II is filled.
 * @param {{ requisition: any }} p
 */
export function OrgMethodEligibility({ requisition }) {
  const line = requisition?.budgetLine;
  const value = requisition?.estimatedTotalValue;
  const committed = requisition?.status === "APPROVED";
  const fundsOk = committed || Boolean(line?.sufficient);

  return (
    <div className="space-y-2 rounded-md bg-surface-card p-3 text-sm" aria-label="Funding and method eligibility">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          <span className="font-semibold">Value:</span> {formatMoneyUGX(value)}
        </span>
        {line ? (
          <span>
            <span className="font-semibold">Budget line:</span> {formatMoneyUGX(line.approvedAmount)} approved ·{" "}
            {formatMoneyUGX(line.availableBalance)} free
          </span>
        ) : null}
        <Chip
          size="small"
          color={fundsOk ? "success" : "error"}
          icon={fundsOk ? <CheckCircleRounded /> : <BlockRounded />}
          label={committed ? "Funds committed" : fundsOk ? "Funds available" : "Insufficient funds"}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Methods:</span>
        {METHODS.map((m) => {
          const fit = checkMethodValueCeiling(m.value, value);
          return (
            <Chip
              key={m.value}
              size="small"
              variant="outlined"
              color={fit.ok ? "success" : "error"}
              icon={fit.ok ? <CheckCircleRounded /> : <BlockRounded />}
              label={fit.ok ? m.label : `${m.label} (max ${formatMoneyUGX(fit.ceiling)})`}
            />
          );
        })}
      </div>
    </div>
  );
}
