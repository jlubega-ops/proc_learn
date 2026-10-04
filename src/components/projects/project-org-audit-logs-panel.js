"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import { useToast } from "@/components/providers/toast-provider";
import { humanizeDomainEvent } from "@/lib/projects/procurement-timeline";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableRefetchOverlaySx,
  adminTableSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";

/** @param {string} eventType */
function eventColor(eventType) {
  const e = String(eventType || "");
  if (/DELETE|REJECT|SUSPEND|CANCEL|REMOVE/.test(e)) return "error";
  if (/APPROVE|COMPLETE|ACTIVATE/.test(e)) return "success";
  if (/RETURN|SUBMIT|PENDING|RESET/.test(e)) return "warning";
  return "primary";
}

/** @param {any} row */
function rowDetails(row) {
  const meta = row.meta || {};
  const parts = [];
  if (typeof meta.description === "string" && meta.description.trim()) parts.push(meta.description.trim());
  if (meta.previousStatus || meta.newStatus) {
    parts.push(`Status: ${meta.previousStatus || "—"} → ${meta.newStatus || "—"}`);
  }
  if (meta.comment) parts.push(`Comment: ${String(meta.comment)}`);
  return parts.join("\n") || "—";
}

/** @param {string | Date} value */
function fmtDateTime(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "MMM d, yyyy · h:mm a");
}

/**
 * @param {{ projectId: string }} p
 */
export function ProjectOrgAuditLogsPanel({ projectId }) {
  const { showToast } = useToast();
  const [initialLoading, setInitialLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [items, setItems] = useState(/** @type {any[]} */ ([]));
  const [total, setTotal] = useState(0);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    if (loadedOnce.current) setRefetching(true);
    try {
      const qp = new URLSearchParams({ page: String(page + 1), pageSize: String(rowsPerPage) });
      if (q) qp.set("q", q);
      const res = await fetch(`/api/projects/${projectId}/audit-logs?${qp}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not load activity logs.",
          severity: "error",
        });
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch {
      showToast({ message: "Could not load activity logs.", severity: "error" });
    } finally {
      loadedOnce.current = true;
      setInitialLoading(false);
      setRefetching(false);
    }
  }, [projectId, page, rowsPerPage, q, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = qInput.trim();
      if (next === q) return;
      setQ(next);
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [qInput, q]);

  if (initialLoading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy="true" role="status">
        <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <Box sx={{ position: "relative" }}>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <TextField
          placeholder="Search activity"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          sx={{ ...themedTextFieldSx, width: { xs: "100%", sm: 320 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded fontSize="small" />
                </InputAdornment>
              ),
            },
            htmlInput: { "aria-label": "Search activity" },
          }}
        />
        <Button
          startIcon={<RefreshRounded />}
          variant="outlined"
          onClick={() => void load()}
          className="w-full sm:w-auto"
          title="Reload activity"
        >
          Refresh
        </Button>
      </div>

      <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
        <Table size="small" sx={{ ...adminTableSx, minWidth: 720 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ whiteSpace: "nowrap" }}>Date &amp; time</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Details</TableCell>
              <TableCell>Performed by</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 5 }}>
                  <Typography variant="body2" sx={adminMutedTextSx}>
                    {q ? "No matching activity." : "No activity yet."}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ whiteSpace: "nowrap", verticalAlign: "top" }}>
                    {fmtDateTime(row.createdAt)}
                  </TableCell>
                  <TableCell sx={{ verticalAlign: "top" }}>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={eventColor(row.eventType)}
                      label={humanizeDomainEvent(row.eventType)}
                      title={row.eventType}
                    />
                  </TableCell>
                  <TableCell sx={{ verticalAlign: "top", whiteSpace: "pre-wrap", maxWidth: 420 }}>
                    {rowDetails(row)}
                  </TableCell>
                  <TableCell sx={{ verticalAlign: "top" }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {row.actor?.displayName || "System"}
                    </Typography>
                    {row.actorRoleName ? (
                      <Typography variant="caption" sx={adminMutedTextSx}>
                        {row.actorRoleName}
                      </Typography>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_e, next) => setPage(next)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(Number(e.target.value));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 20, 50, 100]}
      />
      {refetching ? (
        <Box sx={adminTableRefetchOverlaySx} aria-busy="true" aria-label="Updating activity">
          <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
        </Box>
      ) : null}
    </Box>
  );
}
