"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import { format, isValid, parseISO } from "date-fns";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
} from "@/lib/admin-mui-surfaces";
import { formatMoneyUGX } from "@/lib/money";
import {
  clickableTableRowProps,
  stopRowClick,
} from "@/lib/projects/clickable-table-row";

/**
 * @param {{ projectId: string }} p
 */
export function OrgProcurementsPanel({ projectId }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState(/** @type {any[]} */ ([]));
  const [stats, setStats] = useState(/** @type {Record<string, number>} */ ({}));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/procurements`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not load procurements.",
          severity: "error",
        });
        return;
      }
      setRows(Array.isArray(data.procurements) ? data.procurements : []);
      setStats(data.stats && typeof data.stats === "object" ? data.stats : {});
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusColor = (s) => {
    if (s === "CLOSED") return "success";
    if (s === "REJECTED" || s === "CANCELLED") return "error";
    if (s === "METHOD_SELECTED" || s === "IN_PROGRESS") return "info";
    return "warning";
  };

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy>
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          <Chip size="small" color="primary" label={`Total ${stats.total || 0}`} />
          {stats.IN_PROGRESS ? (
            <Chip size="small" color="info" label={`In progress ${stats.IN_PROGRESS}`} />
          ) : null}
          {stats.EVALUATION ? (
            <Chip size="small" color="warning" label={`Evaluation ${stats.EVALUATION}`} />
          ) : null}
          {stats.AWARDED || stats.AWARD_PENDING ? (
            <Chip
              size="small"
              color="info"
              label={`Award ${(stats.AWARDED || 0) + (stats.AWARD_PENDING || 0)}`}
            />
          ) : null}
          {stats.CLOSED ? (
            <Chip size="small" color="success" label={`Closed ${stats.CLOSED}`} />
          ) : null}
          {(stats.CANCELLED || 0) + (stats.REJECTED || 0) > 0 ? (
            <Chip
              size="small"
              color="error"
              label={`Cancelled/rejected ${(stats.CANCELLED || 0) + (stats.REJECTED || 0)}`}
            />
          ) : null}
        </div>
        <Button startIcon={<RefreshRounded />} variant="outlined" onClick={() => load()}>
          Refresh
        </Button>
      </div>

      {rows.length === 0 ? (
        <Typography sx={adminMutedTextSx}>
          No procurements yet. After a requisition is approved, a Procurement Officer selects a
          method to create a procurement (e.g. PROC-2026-0001).
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Number</TableCell>
                <TableCell>Title</TableCell>
                <TableCell>Method</TableCell>
                <TableCell>Department</TableCell>
                <TableCell>Estimated</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                let when = "—";
                if (r.methodSelectedAt) {
                  const d =
                    typeof r.methodSelectedAt === "string"
                      ? parseISO(r.methodSelectedAt)
                      : new Date(r.methodSelectedAt);
                  if (isValid(d)) when = format(d, "MMM d, yyyy");
                }
                return (
                  <TableRow
                    key={r.id}
                    {...clickableTableRowProps({
                      href: `/projects/${projectId}/procurements/${r.id}`,
                      router,
                    })}
                  >
                    <TableCell>
                      <span className="font-medium">{r.procurementNumber}</span>
                      <div className="text-xs opacity-70">{when}</div>
                    </TableCell>
                    <TableCell>{r.title}</TableCell>
                    <TableCell>
                      <Chip size="small" color="info" label={r.procurementMethod} />
                    </TableCell>
                    <TableCell>{r.department?.name || "—"}</TableCell>
                    <TableCell>
                      {formatMoneyUGX(r.requisition?.estimatedTotalValue)}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={statusColor(r.status)} label={r.status} />
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ whiteSpace: "nowrap" }}
                      onClick={stopRowClick}
                      onKeyDown={stopRowClick}
                    >
                      <Tooltip title="Open procurement">
                        <IconButton
                          component={Link}
                          href={`/projects/${projectId}/procurements/${r.id}`}
                          size="small"
                          color="primary"
                          aria-label={`Open ${r.procurementNumber}`}
                        >
                          <VisibilityRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
