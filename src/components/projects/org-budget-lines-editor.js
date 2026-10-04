"use client";

import { useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import NotesRounded from "@mui/icons-material/NotesRounded";
import { themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { computeLineTotal, formatMoneyAmount, sanitizeNumericInput, toMoneyNumber } from "@/lib/money";
import {
  FUNDING_SOURCES,
  LINE_DESCRIPTION_MAX,
  LINE_TEXT_MAX,
  unitOptionsFor,
} from "@/lib/projects/line-item-options";

const ROW_GRID =
  "@4xl:grid-cols-[1.75rem_minmax(9rem,1.5fr)_5rem_7.5rem_8.5rem_8.5rem_minmax(10.5rem,1.3fr)_4.75rem]";

const numericInput = {
  inputMode: "decimal",
  pattern: "[0-9.,]*",
  autoComplete: "off",
  style: { textAlign: "right" },
};

/** @param {{ children: import("react").ReactNode }} p */
function MobileLabel({ children }) {
  return (
    <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400 @4xl:hidden">
      {children}
    </span>
  );
}

/** @param {{ quantity: string; unitCost: string; approvedAmount: string }} line */
export function budgetLineTotal(line) {
  return computeLineTotal(line.quantity, line.unitCost) ?? toMoneyNumber(line.approvedAmount);
}

/**
 * Inline-editable budget lines: one row per line, totals computed automatically.
 * @param {{
 *   lines: any[];
 *   errors: Record<string, string>;
 *   disabled?: boolean;
 *   onChange: (idx: number, patch: Record<string, unknown>) => void;
 *   onAdd: () => void;
 *   onRemove: (idx: number) => void;
 * }} p
 */
export function OrgBudgetLinesEditor({ lines, errors, disabled = false, onChange, onAdd, onRemove }) {
  const [openNotes, setOpenNotes] = useState(() => new Set());
  const grandTotal = lines.reduce((sum, line) => sum + (budgetLineTotal(line) || 0), 0);

  function toggleNotes(idx) {
    setOpenNotes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function remove(idx) {
    setOpenNotes(new Set());
    onRemove(idx);
  }

  /** @param {number} idx @param {string} key */
  const err = (idx, key) => errors[`lines.${idx}.${key}`];

  /** @param {number} idx @param {any} line */
  function actions(idx, line) {
    const hasNotes = Boolean(String(line.description || "").trim());
    const notesLabel = hasNotes ? "Edit description" : "Add description";
    return (
      <div className="flex shrink-0 items-center justify-end gap-0.5 whitespace-nowrap">
        <Tooltip title={notesLabel}>
          <IconButton
            size="small"
            color={hasNotes || openNotes.has(idx) ? "primary" : "inherit"}
            aria-label={`${notesLabel} for line ${idx + 1}`}
            aria-expanded={hasNotes || openNotes.has(idx)}
            onClick={() => toggleNotes(idx)}
            disabled={disabled}
          >
            <NotesRounded fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete line">
          <span>
            <IconButton
              size="small"
              color="error"
              aria-label={`Delete line ${idx + 1}`}
              onClick={() => remove(idx)}
              disabled={disabled || lines.length <= 1}
            >
              <DeleteOutlineRounded fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="@container w-full">
      <div className="overflow-hidden rounded-lg border border-[color:var(--border-subtle)]">
        <div
          className={`hidden gap-2 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs font-semibold text-foreground @4xl:grid ${ROW_GRID}`}
          role="presentation"
        >
          <span>#</span>
          <span>Category</span>
          <span className="text-right">Qty</span>
          <span>Unit</span>
          <span className="text-right">Unit cost</span>
          <span className="text-right">Total</span>
          <span>Source of funding</span>
          <span className="text-right">Actions</span>
        </div>

        {lines.map((line, idx) => {
          const total = budgetLineTotal(line);
          const showNotes = openNotes.has(idx) || Boolean(String(line.description || "").trim());
          return (
            <div
              key={idx}
              className={`grid grid-cols-2 items-start gap-2 border-b border-[color:var(--border-subtle)] px-3 py-3 last:border-b-0 @4xl:py-2 ${ROW_GRID}`}
            >
              <div className="col-span-2 flex items-center justify-between @4xl:hidden">
                <span className="text-sm font-semibold text-foreground">Line {idx + 1}</span>
                {actions(idx, line)}
              </div>
              <span className="hidden pt-2 text-sm text-zinc-600 dark:text-zinc-400 @4xl:block">{idx + 1}</span>

              <div className="col-span-2 @4xl:col-span-1">
                <MobileLabel>Category</MobileLabel>
                <TextField
                  value={line.category}
                  onChange={(e) => onChange(idx, { category: e.target.value })}
                  placeholder="e.g. Computing devices"
                  fullWidth
                  disabled={disabled}
                  error={Boolean(err(idx, "category"))}
                  helperText={err(idx, "category") || undefined}
                  sx={themedTextFieldSx}
                  slotProps={{
                    htmlInput: { maxLength: LINE_TEXT_MAX, "aria-label": `Line ${idx + 1} category` },
                  }}
                />
              </div>

              <div>
                <MobileLabel>Qty</MobileLabel>
                <TextField
                  value={line.quantity}
                  onChange={(e) => onChange(idx, { quantity: sanitizeNumericInput(e.target.value) })}
                  onBlur={(e) => {
                    const v = formatMoneyAmount(e.target.value);
                    if (v) onChange(idx, { quantity: v });
                  }}
                  fullWidth
                  disabled={disabled}
                  error={Boolean(err(idx, "quantity"))}
                  helperText={err(idx, "quantity") || undefined}
                  sx={themedTextFieldSx}
                  slotProps={{ htmlInput: { ...numericInput, "aria-label": `Line ${idx + 1} quantity` } }}
                />
              </div>

              <div>
                <MobileLabel>Unit</MobileLabel>
                <TextField
                  select
                  value={line.unitOfMeasure}
                  onChange={(e) => onChange(idx, { unitOfMeasure: e.target.value })}
                  fullWidth
                  disabled={disabled}
                  error={Boolean(err(idx, "unitOfMeasure"))}
                  helperText={err(idx, "unitOfMeasure") || undefined}
                  sx={themedTextFieldSx}
                  slotProps={{ htmlInput: { "aria-label": `Line ${idx + 1} unit` } }}
                >
                  {unitOptionsFor(line.unitOfMeasure).map((u) => (
                    <MenuItem key={u} value={u}>
                      {u}
                    </MenuItem>
                  ))}
                </TextField>
              </div>

              <div>
                <MobileLabel>Unit cost (UGX)</MobileLabel>
                <TextField
                  value={line.unitCost}
                  onChange={(e) => onChange(idx, { unitCost: sanitizeNumericInput(e.target.value) })}
                  onBlur={(e) => {
                    const v = formatMoneyAmount(e.target.value);
                    if (v) onChange(idx, { unitCost: v });
                  }}
                  placeholder="0"
                  fullWidth
                  disabled={disabled}
                  error={Boolean(err(idx, "unitCost"))}
                  helperText={err(idx, "unitCost") || undefined}
                  sx={themedTextFieldSx}
                  slotProps={{ htmlInput: { ...numericInput, "aria-label": `Line ${idx + 1} unit cost` } }}
                />
              </div>

              <div>
                <MobileLabel>Total (UGX)</MobileLabel>
                <TextField
                  value={total != null ? formatMoneyAmount(total) : ""}
                  placeholder="—"
                  fullWidth
                  error={Boolean(err(idx, "approvedAmount"))}
                  helperText={err(idx, "approvedAmount") || undefined}
                  sx={{
                    ...themedTextFieldSx,
                    "& .MuiInputBase-input": { fontWeight: 600, textAlign: "right" },
                  }}
                  slotProps={{
                    input: { readOnly: true },
                    htmlInput: { tabIndex: -1, "aria-label": `Line ${idx + 1} total` },
                  }}
                  title="Quantity × unit cost"
                />
              </div>

              <div className="col-span-2 @4xl:col-span-1">
                <MobileLabel>Source of funding</MobileLabel>
                <Autocomplete
                  freeSolo
                  options={FUNDING_SOURCES}
                  value={line.fundingSource}
                  inputValue={line.fundingSource}
                  onInputChange={(_e, v) => onChange(idx, { fundingSource: v })}
                  disabled={disabled}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      error={Boolean(err(idx, "fundingSource"))}
                      helperText={err(idx, "fundingSource") || undefined}
                      sx={themedTextFieldSx}
                      slotProps={{
                        ...params.slotProps,
                        htmlInput: {
                          ...params.slotProps?.htmlInput,
                          maxLength: LINE_TEXT_MAX,
                          "aria-label": `Line ${idx + 1} source of funding`,
                        },
                      }}
                    />
                  )}
                />
              </div>

              <div className="hidden pt-0.5 @4xl:block">{actions(idx, line)}</div>

              {showNotes ? (
                <div className="col-span-2 @4xl:[grid-column:2/-2]">
                  <TextField
                    value={line.description}
                    onChange={(e) => onChange(idx, { description: e.target.value })}
                    placeholder="Description (optional)"
                    fullWidth
                    multiline
                    minRows={1}
                    maxRows={4}
                    disabled={disabled}
                    sx={themedTextFieldSx}
                    slotProps={{
                      htmlInput: { maxLength: LINE_DESCRIPTION_MAX, "aria-label": `Line ${idx + 1} description` },
                    }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-2">
          <Button
            type="button"
            variant="outlined"
            startIcon={<AddRounded />}
            onClick={onAdd}
            disabled={disabled}
            title="Add a budget line"
          >
            Add line
          </Button>
          <p className="text-sm text-foreground" aria-live="polite">
            <span className="font-semibold">Grand total</span>{" "}
            <span className="font-bold">UGX {formatMoneyAmount(grandTotal) || "0"}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
