"use client";

import Chip from "@mui/material/Chip";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import BlockRounded from "@mui/icons-material/BlockRounded";
import { formatMoneyUGX } from "@/lib/money";
import {
  bandsForThresholdCategory,
  checkMethodValueCeiling,
  planMethodOptionState,
  resolveThresholdCategory,
} from "@/lib/projects/procurement-thresholds";

const METHODS = [
  { value: "MICRO", label: "Micro Procurement" },
  { value: "QUOTATION", label: "Quotation" },
  { value: "TENDER", label: "Tender" },
];

/**
 * @param {unknown} method
 * @param {unknown} value
 * @param {{ category?: string | null; allowDirectMicro?: boolean }} [opts]
 */
export function methodAllowedForValue(method, value, opts = {}) {
  return checkMethodValueCeiling(String(method || ""), value, {
    category: opts.category,
    allowDirectMicro: opts.allowDirectMicro,
  }).ok;
}

/**
 * Funding and method fit for a requisition.
 * @param {{
 *   requisition: any;
 *   selecting?: boolean;
 *   selectedMethod?: string | null;
 *   allowDirectMicro?: boolean;
 * }} p
 */
export function OrgMethodEligibility({
  requisition,
  selecting = false,
  selectedMethod = null,
  allowDirectMicro = false,
}) {
  const line = requisition?.budgetLine;
  const value = requisition?.estimatedTotalValue;
  const category = requisition?.category || null;
  const committed = requisition?.status === "APPROVED";
  const fundsOk = committed || Boolean(line?.sufficient);
  const recorded = String(requisition?.procurementMethod || "").toUpperCase();
  const chosen = String(selectedMethod || "").toUpperCase();
  const visible = selecting || !recorded ? METHODS : METHODS.filter((m) => m.value === recorded);
  const bands = bandsForThresholdCategory(category);
  const catKey = resolveThresholdCategory(category);

  return (
    <div
      className="space-y-2 rounded-md bg-surface-card p-3 text-sm"
      aria-label="Funding and method eligibility"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          <span className="font-semibold">Value:</span> {formatMoneyUGX(value)}
        </span>
        {line ? (
          <span>
            <span className="font-semibold">Budget line:</span>{" "}
            {formatMoneyUGX(line.approvedAmount)} approved ·{" "}
            {formatMoneyUGX(committed ? line.projectedBalance : line.availableBalance)} free
          </span>
        ) : null}
        <Chip
          size="small"
          color={fundsOk ? "success" : "error"}
          icon={fundsOk ? <CheckCircleRounded /> : <BlockRounded />}
          label={committed ? "Funds committed" : fundsOk ? "Funds available" : "Insufficient funds"}
        />
      </div>
      <div className="text-xs opacity-80">
        Guideline 1/2025 ({catKey.replace(/_/g, " ").toLowerCase()}): Micro ≤{" "}
        {formatMoneyUGX(bands.microMax)} · Quotation ≤ {formatMoneyUGX(bands.quotationMax)} ·
        Restricted ≤ {formatMoneyUGX(bands.restrictedMax)} · Open above
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">
          {selecting || !recorded ? "Allowed for this value:" : "Method:"}
        </span>
        {visible.map((m) => {
          const state = planMethodOptionState(m.value, value, category, {
            allowDirectMicro: allowDirectMicro || selecting,
          });
          const isChosen = selecting ? chosen === m.value : recorded === m.value;
          const suffix = state.directOnly
            ? " (Direct only)"
            : state.recommended
              ? " (recommended)"
              : "";
          return (
            <Chip
              key={m.value}
              size="small"
              variant={isChosen ? "filled" : "outlined"}
              color={state.enabled ? (isChosen ? "primary" : "success") : "error"}
              icon={state.enabled ? <CheckCircleRounded /> : <BlockRounded />}
              label={
                state.enabled
                  ? `${m.label}${suffix}`
                  : `${m.label} — ${state.reason || "above limit"}`
              }
              title={state.reason || `${m.label} for this value`}
            />
          );
        })}
      </div>
    </div>
  );
}
