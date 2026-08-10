"use client";

import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
} from "@/lib/admin-mui-surfaces";
import { formatMoneyAmount, formatMoneyUGX } from "@/lib/money";

/**
 * Read-only computation / preview table for line items.
 *
 * @param {{
 *   columns: { id: string; label: string; align?: "left" | "right"; money?: boolean; render?: (row: any, index: number) => import("react").ReactNode }[];
 *   rows: any[];
 *   getRowKey?: (row: any, index: number) => string | number;
 *   emptyMessage?: string;
 *   footerLabel?: string;
 *   footerTotal?: string | number | null;
 *   title?: string;
 * }} p
 */
export function OrgLineItemsTable({
  columns,
  rows,
  getRowKey,
  emptyMessage = "No line items.",
  footerLabel = "Total",
  footerTotal = null,
  title,
}) {
  const list = Array.isArray(rows) ? rows : [];

  return (
    <div className="space-y-2">
      {title ? (
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
      ) : null}
      {list.length === 0 ? (
        <Typography sx={adminMutedTextSx}>{emptyMessage}</Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                {columns.map((col) => (
                  <TableCell key={col.id} align={col.align || "left"}>
                    {col.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((row, index) => (
                <TableRow key={getRowKey ? getRowKey(row, index) : row.id || index}>
                  {columns.map((col) => {
                    const raw = col.render ? col.render(row, index) : row[col.id];
                    let display = raw;
                    if (col.money && (raw === 0 || raw)) {
                      display = formatMoneyAmount(raw);
                    } else if (col.money && (raw === null || raw === undefined || raw === "")) {
                      display = "—";
                    }
                    return (
                      <TableCell key={col.id} align={col.align || "left"}>
                        {display ?? "—"}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {footerTotal !== null && footerTotal !== undefined ? (
                <TableRow>
                  <TableCell
                    colSpan={Math.max(1, columns.length - 1)}
                    sx={{ fontWeight: 700 }}
                    align="right"
                  >
                    {footerLabel}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {formatMoneyUGX(footerTotal)}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
