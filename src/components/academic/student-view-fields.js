"use client";

import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { campusSelectOptions } from "@/lib/campuses";
import { themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { useApi } from "@/hooks/use-api";

/**
 * Active programmes for staff Student Mode. Loads when `enabled` turns true.
 * @param {boolean} enabled
 */
export function useStudentViewOptions(enabled) {
  const { data, error } = useApi(enabled ? "/api/user/student-view" : null, { silentErrors: true });
  const programmes = Array.isArray(data?.programmes) ? data.programmes : [];
  return { loading: enabled && !data && !error, programmes };
}

/**
 * Client check before calling the API.
 * @param {{ programmeId: string }} value
 * @returns {Record<string, string>}
 */
export function validateStudentViewFields(value) {
  return value.programmeId ? {} : { programmeId: "Choose a programme." };
}

/**
 * @param {{
 *   value: { programmeId: string; campus: string };
 *   onChange: (next: { programmeId: string; campus: string }) => void;
 *   programmes: { id: string; name: string; shortName: string }[];
 *   errors?: Record<string, string>;
 *   disabled?: boolean;
 * }} props
 */
export function StudentViewFields({ value, onChange, programmes, errors = {}, disabled = false }) {
  return (
    <div className="grid gap-1">
      <TextField
        select
        label="Programme"
        value={value.programmeId}
        onChange={(e) => onChange({ ...value, programmeId: e.target.value })}
        error={Boolean(errors.programmeId)}
        helperText={errors.programmeId || " "}
        disabled={disabled}
        sx={themedTextFieldSx}
        fullWidth
      >
        {programmes.length === 0 ? (
          <MenuItem value="" disabled>
            No programmes yet.
          </MenuItem>
        ) : null}
        {programmes.map((p) => (
          <MenuItem key={p.id} value={p.id} title={p.name}>
            {p.shortName ? `${p.shortName} — ${p.name}` : p.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Campus"
        value={value.campus}
        onChange={(e) => onChange({ ...value, campus: e.target.value })}
        helperText=" "
        disabled={disabled}
        sx={themedTextFieldSx}
        fullWidth
      >
        <MenuItem value="">All campuses</MenuItem>
        {campusSelectOptions().map((c) => (
          <MenuItem key={c.value} value={c.value}>
            {c.label}
          </MenuItem>
        ))}
      </TextField>
    </div>
  );
}
