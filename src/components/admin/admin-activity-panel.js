"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
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
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import { format } from "date-fns";
import { AuditEvent } from "@/lib/audit-events";
import {
  auditEventTypeLabel,
  formatAuditMetaEntries,
  LOGIN_AUDIT_EVENTS,
} from "@/lib/audit-log-display";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";

const EVENT_OPTIONS = ["", ...[...Object.values(AuditEvent)].sort((a, b) => a.localeCompare(b))];

/**
 * @param {string | null | undefined} iso
 */
function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, yyyy h:mm a");
  } catch {
    return "—";
  }
}

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
  const [detailRow, setDetailRow] = useState(/** @type {any | null} */ (null));

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
  const detailMeta = detailRow
    ? formatAuditMetaEntries(detailRow.meta, detailRow.eventType)
    : [];

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
          value={from}
          onChange={(e) => {
            setPage(1);
            setFrom(e.target.value);
          }}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={themedTextFieldSx}
        />
        <TextField
          label="To"
          type="date"
          size="small"
          value={to}
          onChange={(e) => {
            setPage(1);
            setTo(e.target.value);
          }}
          slotProps={{ inputLabel: { shrink: true } }}
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
                <TableCell>When</TableCell>
                <TableCell>Event</TableCell>
                <TableCell>Actor</TableCell>
                <TableCell>Target</TableCell>
                <TableCell>Sign-in</TableCell>
                <TableCell>IP</TableCell>
                <TableCell align="right">Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    {formatWhen(row.createdAt)}
                  </TableCell>
                  <TableCell>{auditEventTypeLabel(row.eventType)}</TableCell>
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
                    {LOGIN_AUDIT_EVENTS.has(row.eventType) ? (
                      <Typography variant="body2">{row.loginMethod || "—"}</Typography>
                    ) : (
                      <Typography variant="body2" sx={adminMutedTextSx}>
                        —
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={adminMutedTextSx}>
                      {row.ip ?? "—"}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="View full log details">
                      <IconButton
                        size="small"
                        aria-label="View full log details"
                        color="primary"
                        onClick={() => setDetailRow(row)}
                      >
                        <VisibilityRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
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

      <Dialog
        open={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Activity log details</DialogTitle>
        <DialogContent dividers className="space-y-3">
          {detailRow ? (
            <>
              <div>
                <Typography variant="overline" sx={adminMutedTextSx}>
                  Event
                </Typography>
                <Typography variant="body1" fontWeight={600}>
                  {auditEventTypeLabel(detailRow.eventType)}
                </Typography>
                <Typography variant="caption" sx={adminMutedTextSx}>
                  {detailRow.eventType}
                </Typography>
              </div>
              <div>
                <Typography variant="overline" sx={adminMutedTextSx}>
                  When
                </Typography>
                <Typography variant="body2">{formatWhen(detailRow.createdAt)}</Typography>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Typography variant="overline" sx={adminMutedTextSx}>
                    Actor
                  </Typography>
                  <Typography variant="body2">{detailRow.actorLabel || "—"}</Typography>
                  {detailRow.actorEmail ? (
                    <Typography variant="caption" sx={adminMutedTextSx}>
                      {detailRow.actorEmail}
                    </Typography>
                  ) : null}
                </div>
                <div>
                  <Typography variant="overline" sx={adminMutedTextSx}>
                    Target
                  </Typography>
                  <Typography variant="body2">{detailRow.targetLabel || "—"}</Typography>
                  {detailRow.targetEmail ? (
                    <Typography variant="caption" sx={adminMutedTextSx}>
                      {detailRow.targetEmail}
                    </Typography>
                  ) : null}
                </div>
              </div>
              <div>
                <Typography variant="overline" sx={adminMutedTextSx}>
                  IP address
                </Typography>
                <Typography variant="body2">{detailRow.ip || "—"}</Typography>
              </div>
              <div>
                <Typography variant="overline" sx={adminMutedTextSx}>
                  Browser / device
                </Typography>
                <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                  {detailRow.userAgent || "—"}
                </Typography>
              </div>
              {detailMeta.length > 0 ? (
                <div>
                  <Typography variant="overline" sx={adminMutedTextSx}>
                    Additional details
                  </Typography>
                  <dl className="mt-1 space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                    {detailMeta.map(({ label, value }) => (
                      <div key={label}>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          {label}
                        </dt>
                        <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-100">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : (
                <Typography variant="body2" sx={adminMutedTextSx}>
                  No extra metadata was recorded for this event.
                </Typography>
              )}
            </>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailRow(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
