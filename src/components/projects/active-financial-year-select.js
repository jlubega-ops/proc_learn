"use client";

import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { adminMutedTextSx, themedTextFieldSx } from "@/lib/admin-mui-surfaces";

export const NO_ACTIVE_FY_MESSAGE =
  "No active financial year is available. Ask the Organization Administrator to create and activate a financial year that covers today's date.";

/**
 * FY select for operational forms — options come from `?selectable=1` (active + date-valid).
 * @param {{
 *   value: string;
 *   onChange: (financialYearId: string) => void;
 *   years: { id: string; label: string }[];
 *   emptyMessage?: string | null;
 *   disabled?: boolean;
 *   required?: boolean;
 *   className?: string;
 *   fullWidth?: boolean;
 *   error?: boolean;
 *   helperText?: string;
 * }} p
 */
export function ActiveFinancialYearSelect({
  value,
  onChange,
  years,
  emptyMessage = null,
  disabled = false,
  required = false,
  className,
  fullWidth = true,
  error = false,
  helperText,
}) {
  const hasYears = Array.isArray(years) && years.length > 0;
  const message = emptyMessage || NO_ACTIVE_FY_MESSAGE;
  const defaultHelp =
    hasYears && years.length === 1
      ? "Active financial year for this organisation"
      : undefined;

  if (!hasYears) {
    return (
      <div className={className || undefined}>
        <TextField
          select
          label="Financial year"
          value=""
          fullWidth={fullWidth}
          disabled
          required={required}
          error
          sx={themedTextFieldSx}
          helperText={helperText || "No active financial year"}
        >
          <MenuItem value="" disabled>
            No active financial year
          </MenuItem>
        </TextField>
        <Typography sx={{ ...adminMutedTextSx, mt: 1 }} className="text-sm">
          {message}
        </Typography>
      </div>
    );
  }

  return (
    <TextField
      select
      label="Financial year"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      fullWidth={fullWidth}
      disabled={disabled}
      required={required}
      className={className}
      error={error}
      sx={themedTextFieldSx}
      helperText={helperText || defaultHelp}
    >
      {years.map((y) => (
        <MenuItem key={y.id} value={y.id}>
          {y.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
