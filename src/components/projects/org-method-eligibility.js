"use client";

import Chip from "@mui/material/Chip";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import BlockRounded from "@mui/icons-material/BlockRounded";
import { formatMoneyUGX } from "@/lib/money";
import { checkMethodValueCeiling } from "@/lib/projects/procurement-thresholds";

const METHODS = [
  { value: "MICRO", label: "Micro Procurement" },
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
 * Funding and method fit for a requisition. Once a method is recorded only that method is shown;
 * while choosing (`selecting`), every method is listed against the value ceiling.
 * @param {{ requisition: any; selecting?: boolean; selectedMethod?: string | null }} p
 */
export function OrgMethodEligibility({ requisition, selecting = false, selectedMethod = null }) {
  const line = requisition?.budgetLine;
  const value = requisition?.estimatedTotalValue;
  const committed = requisition?.status === "APPROVED";
  const fundsOk = committed || Boolean(line?.sufficient);
  const recorded = String(requisition?.procurementMethod || "").toUpperCase();
  const chosen = String(selectedMethod || "").toUpperCase();
  const visible = selecting || !recorded ? METHODS : METHODS.filter((m) => m.value === recorded);

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
        <span className="font-semibold">
          {selecting || !recorded ? "Allowed for this value:" : "Method:"}
        </span>
        {visible.map((m) => {
          const fit = checkMethodValueCeiling(m.value, value);
          const isChosen = selecting ? chosen === m.value : recorded === m.value;
          return (
            <Chip
              key={m.value}
              size="small"
              variant={isChosen ? "filled" : "outlined"}
              color={fit.ok ? (isChosen ? "primary" : "success") : "error"}
              icon={fit.ok ? <CheckCircleRounded /> : <BlockRounded />}
              label={fit.ok ? m.label : `${m.label} (max ${formatMoneyUGX(fit.ceiling)})`}
              title={fit.ok ? `${m.label} is allowed for this value` : `${m.label} is above its limit`}
            />
          );
        })}
      </div>
    </div>
  );
}
