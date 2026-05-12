"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { AuditEvent } from "@/lib/audit-events";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";

const EVENT_OPTIONS = ["", ...[...Object.values(AuditEvent)].sort((a, b) => a.localeCompare(b))];

export function AdminActivityPanel() {
  const { showToast } = useToast();
  const [q, setQ] = useState("");
  const [eventType, setEventType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState(/** @type {any[]} */ ([]));
  const [loading, setLoading] = useState(true);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (eventType) p.set("eventType", eventType);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return p.toString();
  }, [q, eventType, from, to, page, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/audit-logs?${queryString}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not load activity.",
          severity: "error",
        });
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } finally {
      setLoading(false);
    }
  }, [queryString, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-background p-4 dark:border-zinc-800 md:flex-row md:flex-wrap md:items-end">
        <TextField
          label="Search user"
          placeholder="Name or email"
          size="small"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          sx={{ ...themedTextFieldSx, minWidth: 220, flex: 1 }}
        />
        <FormControl size="small" sx={{ ...themedTextFieldSx, minWidth: 200 }}>
          <InputLabel id="evt-type">Event type</InputLabel>
          <Select
            labelId="evt-type"
            label="Event type"
            value={eventType}
            onChange={(e) => {
              setPage(1);
              setEventType(String(e.target.value));
            }}
          >
            {EVENT_OPTIONS.map((ev) => (
              <MenuItem key={ev || "all"} value={ev}>
                {ev || "All types"}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="From"
          type="date"
          size="small"
          InputLabelProps={{ shrink: true }}
          value={from}
          onChange={(e) => {
            setPage(1);
            setFrom(e.target.value);
          }}
          sx={themedTextFieldSx}
        />
        <TextField
          label="To"
          type="date"
          size="small"
          InputLabelProps={{ shrink: true }}
          value={to}
          onChange={(e) => {
            setPage(1);
            setTo(e.target.value);
          }}
          sx={themedTextFieldSx}
        />
        <Button variant="outlined" size="small" onClick={() => void load()}>
          Apply
        </Button>
      </div>

      {loading ? (
        <Box sx={adminCenteredLoadingBoxSx} aria-busy="true" aria-label="Loading activity">
          <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
        </Box>
      ) : items.length === 0 ? (
        <Typography variant="body2" sx={adminMutedTextSx}>
          No activity matches these filters.
        </Typography>
      ) : (
        <TableContainer
          component={Paper}
          variant="outlined"
          sx={adminOutlinedTableContainerSx}
        >
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>When (UTC)</TableCell>
                <TableCell>Event</TableCell>
                <TableCell>Actor</TableCell>
                <TableCell>Target</TableCell>
                <TableCell>IP</TableCell>
                <TableCell>Meta</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((row) => {
                const metaStr = row.meta != null ? JSON.stringify(row.meta) : "";
                return (
                <TableRow key={row.id}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    {new Date(row.createdAt).toISOString().replace("T", " ").slice(0, 19)}
                  </TableCell>
                  <TableCell>{row.eventType}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: "var(--foreground)" }}>
                      {row.actorLabel ?? "—"}
                    </Typography>
                    {row.actorEmail ? (
                      <Typography variant="caption" sx={adminMutedTextSx}>
                        {row.actorEmail}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: "var(--foreground)" }}>
                      {row.targetLabel ?? "—"}
                    </Typography>
                    {row.targetEmail ? (
                      <Typography variant="caption" sx={adminMutedTextSx}>
                        {row.targetEmail}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={adminMutedTextSx}>
                      {row.ip ?? "—"}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 220 }}>
                    <Typography variant="caption" sx={{ ...adminMutedTextSx, wordBreak: "break-word" }}>
                      {metaStr
                        ? metaStr.length > 160
                          ? `${metaStr.slice(0, 160)}…`
                          : metaStr
                        : "—"}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="caption" sx={adminMutedTextSx}>
          Page {page} of {totalPages} · {total} total
        </Typography>
        <div className="flex gap-2">
          <Button
            size="small"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            size="small"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
