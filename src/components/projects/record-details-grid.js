"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { formatPrintDate } from "@/components/print/print-document";
import { adminMutedTextSx } from "@/lib/admin-mui-surfaces";

/**
 * "Name · Role · Date" for prepared-by / approved-by fields.
 * @param {{ displayName?: string; roleName?: string | null } | null | undefined} person
 * @param {string | Date | null | undefined} [date]
 */
export function recordPersonLine(person, date) {
  if (!person?.displayName) return null;
  const role = person.roleName ? ` · ${person.roleName}` : "";
  const when = date ? ` · ${formatPrintDate(date)}` : "";
  return `${person.displayName}${role}${when}`;
}

/**
 * Labelled summary of a business record (budget, plan, …).
 * `wide` spans two columns on large screens; `full` spans the whole row.
 * @param {{ fields: { label: string; value?: import("react").ReactNode; wide?: boolean; full?: boolean }[] }} p
 */
export function RecordDetailsGrid({ fields }) {
  return (
    <Box
      component="dl"
      className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4"
      sx={{ borderColor: "divider", m: 0 }}
    >
      {fields.map((f) => (
        <div
          key={f.label}
          className={`min-w-0 ${f.full ? "sm:col-span-2 lg:col-span-4" : f.wide ? "lg:col-span-2" : ""}`}
        >
          <Typography
            component="dt"
            variant="caption"
            sx={{
              ...adminMutedTextSx,
              display: "block",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            {f.label}
          </Typography>
          <Typography
            component="dd"
            variant="body2"
            sx={{ m: 0, fontWeight: 500, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}
          >
            {f.value || "—"}
          </Typography>
        </div>
      ))}
    </Box>
  );
}
