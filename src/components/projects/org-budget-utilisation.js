"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import TablePagination from "@mui/material/TablePagination";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { OrgLineItemsTable } from "@/components/projects/org-line-items-table";
import { formatPrintDate } from "@/components/print/print-document";
import { useToast } from "@/components/providers/toast-provider";
import { adminMutedTextSx, adminOutlinedTableContainerSx, themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { BRAND_BLUE, BRAND_YELLOW_ON_LIGHT, SEMANTIC } from "@/lib/brand-colors";
import { formatMoneyUGX } from "@/lib/money";

const SEGMENTS = [
  { key: "spent", label: "Spent", color: SEMANTIC.success },
  { key: "committedUnspent", label: "Committed", color: BRAND_BLUE },
  { key: "pending", label: "Pending approval", color: BRAND_YELLOW_ON_LIGHT },
];

/** @param {any} v */
const num = (v) => Number(v ?? 0) || 0;

/**
 * Stacked bar of spent / committed / pending against the approved amount.
 * @param {{ approved: any; committed: any; spent: any; pending: any; compact?: boolean }} p
 */
function UtilisationBar({ approved, committed, spent, pending, compact = false }) {
  const total = num(approved);
  /** @type {Record<string, number>} */
  const values = {
    spent: Math.min(num(spent), num(committed)),
    committedUnspent: Math.max(0, num(committed) - num(spent)),
    pending: num(pending),
  };
  const pct = (/** @type {number} */ v) => (total > 0 ? Math.min(100, (v / total) * 100) : 0);
  const usedPct = total > 0 ? Math.round((num(committed) / total) * 100) : 0;
  return (
    <div className={compact ? "flex min-w-[120px] items-center gap-2" : "space-y-2"}>
      <div
        className={`flex w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700 ${compact ? "h-2" : "h-3"}`}
        role="img"
        aria-label={`${usedPct}% of the approved amount committed`}
      >
        {SEGMENTS.map((s) =>
          values[s.key] > 0 ? (
            <Tooltip key={s.key} title={`${s.label}: ${formatMoneyUGX(values[s.key])}`}>
              <span style={{ width: `${pct(values[s.key])}%`, backgroundColor: s.color }} className="h-full" />
            </Tooltip>
          ) : null,
        )}
      </div>
      {compact ? (
        <span className="w-10 text-right text-xs font-semibold">{usedPct}%</span>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {SEGMENTS.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600" aria-hidden />
            Available
          </span>
        </div>
      )}
    </div>
  );
}

/** @param {{ label: string; value: any; tone?: string }} p */
function Stat({ label, value, tone }) {
  return (
    <div className="min-w-0 rounded-lg border p-3" style={{ borderColor: "var(--border-subtle, rgba(0,0,0,0.12))" }}>
      <Typography variant="caption" sx={{ ...adminMutedTextSx, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, overflowWrap: "anywhere", color: tone }}>
        {formatMoneyUGX(value)}
      </Typography>
    </div>
  );
}

/** @param {any} a */
function stageChip(a) {
  if (a.procurement) {
    const s = a.procurement.status;
    const color = s === "CLOSED" ? "success" : s === "CANCELLED" || s === "REJECTED" ? "error" : "info";
    const label = s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
    return <Chip size="small" variant="outlined" color={color} label={label} />;
  }
  const s = a.requisitionStatus;
  if (s === "APPROVED") return <Chip size="small" variant="outlined" color="info" label="Approved" />;
  if (s === "REJECTED" || s === "CANCELLED") {
    return <Chip size="small" variant="outlined" color="error" label={s === "REJECTED" ? "Rejected" : "Cancelled"} />;
  }
  return <Chip size="small" variant="outlined" color="warning" label={s === "RETURNED" ? "Returned" : "Pending approval"} />;
}

/**
 * Budget execution: approved vs committed vs spent, per line, with the procurements charged to it.
 * @param {{ projectId: string; budgetId: string }} p
 */
export function OrgBudgetUtilisation({ projectId, budgetId }) {
  const { showToast } = useToast();
  const [data, setData] = useState(/** @type {any} */ (null));
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [lineId, setLineId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize) });
      if (lineId) qs.set("lineId", lineId);
      const res = await fetch(`/api/projects/${projectId}/budgets/${budgetId}/utilisation?${qs}`, {
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({ message: typeof body.error === "string" ? body.error : "Could not load utilisation.", severity: "error" });
        return;
      }
      setData(body);
    } finally {
      setLoading(false);
    }
  }, [projectId, budgetId, page, pageSize, lineId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Budget utilisation
        </Typography>
        <Box className="flex justify-center py-6" aria-busy={loading}>
          {loading ? <CircularProgress size={24} /> : <Typography sx={adminMutedTextSx}>No data.</Typography>}
        </Box>
      </Paper>
    );
  }

  const t = data.totals;
  return (
    <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Budget utilisation
        </Typography>
        {loading ? <CircularProgress size={18} aria-label="Loading" /> : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Approved" value={t.approved} />
        <Stat label="Committed" value={t.committed} tone={BRAND_BLUE} />
        <Stat label="Spent" value={t.spent} tone={SEMANTIC.success} />
        <Stat label="Pending approval" value={t.pending} tone={BRAND_YELLOW_ON_LIGHT} />
        <Stat label="Available" value={t.available} tone={num(t.available) < 0 ? SEMANTIC.destructive : undefined} />
      </div>
      <div className="mt-3">
        <UtilisationBar approved={t.approved} committed={t.committed} spent={t.spent} pending={t.pending} />
      </div>

      <div className="mt-4">
        <OrgLineItemsTable
          title="By budget line"
          rows={data.lines}
          emptyMessage="No budget lines."
          columns={[
            { id: "line", label: "Line", render: (l) => `${l.code} — ${l.name}` },
            { id: "approved", label: "Approved", align: "right", money: true },
            { id: "committed", label: "Committed", align: "right", money: true },
            { id: "spent", label: "Spent", align: "right", money: true },
            { id: "available", label: "Available", align: "right", money: true },
            {
              id: "used",
              label: "Used",
              render: (l) => (
                <UtilisationBar compact approved={l.approved} committed={l.committed} spent={l.spent} pending={l.pending} />
              ),
            },
          ]}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Procurements charged
        </Typography>
        <TextField
          select
          label="Budget line"
          value={lineId}
          onChange={(e) => {
            setLineId(e.target.value);
            setPage(0);
          }}
          sx={{ ...themedTextFieldSx, minWidth: 220 }}
          className="w-full sm:w-auto"
        >
          <MenuItem value="">All lines</MenuItem>
          {data.lines.map((l) => (
            <MenuItem key={l.id} value={l.id}>
              {l.code} — {l.name}
            </MenuItem>
          ))}
        </TextField>
      </div>
      <div className="mt-2">
        <OrgLineItemsTable
          rows={data.activity.items}
          emptyMessage="Nothing charged yet."
          columns={[
            { id: "date", label: "Date", render: (a) => formatPrintDate(a.date) },
            {
              id: "ref",
              label: "Reference",
              render: (a) =>
                a.procurement ? (
                  <Link href={`/projects/${projectId}/procurements/${a.procurement.id}`} className="font-semibold text-primary hover:underline">
                    {a.procurement.procurementNumber}
                  </Link>
                ) : (
                  <Link href={`/projects/${projectId}/requisitions/${a.id}`} className="font-semibold text-primary hover:underline">
                    {a.requisitionReference || "Requisition"}
                  </Link>
                ),
            },
            { id: "title", label: "Item", render: (a) => a.title },
            { id: "line", label: "Line", render: (a) => a.budgetLine?.code || "—" },
            { id: "stage", label: "Stage", render: (a) => stageChip(a) },
            { id: "estimate", label: "Estimate", align: "right", money: true },
            {
              id: "order",
              label: "Order value",
              align: "right",
              render: (a) => (a.order ? formatMoneyUGX(a.order.value) : "—"),
            },
            { id: "paid", label: "Paid", align: "right", money: true },
          ]}
        />
        <TablePagination
          component="div"
          count={data.activity.total}
          page={page}
          onPageChange={(_e, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      </div>
    </Paper>
  );
}
