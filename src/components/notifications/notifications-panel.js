"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableRefetchOverlaySx,
  adminTableSx,
} from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";
import { useApi } from "@/hooks/use-api";
import { revalidateApi } from "@/lib/api-client-cache";

const primaryAccent = "#008bd0";
const API_BASE = "/api/user/notifications";

export function NotificationsPanel() {
  const { showToast } = useToast();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [markSelectedBusy, setMarkSelectedBusy] = useState(false);
  const [markAllBusy, setMarkAllBusy] = useState(false);
  const [selected, setSelected] = useState(/** @type {Set<string>} */ (new Set()));
  const [detail, setDetail] = useState(/** @type {any | null} */ (null));

  const listQuery = new URLSearchParams({
    page: String(page + 1),
    pageSize: String(rowsPerPage),
  });
  const listUrl = `${API_BASE}?${listQuery.toString()}`;
  const { data, loading, refreshing, reload } = useApi(listUrl, {
    errorMessage: "Could not load notifications.",
  });
  const items = Array.isArray(data?.notifications) ? data.notifications : [];
  const total = Number(data?.total) || 0;

  const load = useCallback(
    async () => {
      await reload();
      void revalidateApi(API_BASE);
    },
    [reload],
  );

  useEffect(() => {
    setSelected(new Set());
  }, [page, rowsPerPage]);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(total / rowsPerPage) || 1);
    if (page > 0 && page >= pageCount) setPage(pageCount - 1);
  }, [total, rowsPerPage, page]);

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    const unreadIds = items.filter((n) => !n.readAt).map((n) => n.id);
    if (unreadIds.length === 0) return;
    const allSelected = unreadIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of unreadIds) next.delete(id);
      } else {
        for (const id of unreadIds) next.add(id);
      }
      return next;
    });
  }

  async function markIdsAsRead(ids) {
    if (ids.length === 0) return;
    setMarkSelectedBusy(true);
    try {
      const res = await fetch(API_BASE, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markRead: true, ids }),
      });
      if (!res.ok) {
        showToast({ message: "Could not update notifications.", severity: "error" });
        return;
      }
      setSelected(new Set());
      await load();
    } finally {
      setMarkSelectedBusy(false);
    }
  }

  async function markAllRead() {
    setMarkAllBusy(true);
    try {
      const res = await fetch(API_BASE, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (!res.ok) {
        showToast({ message: "Could not update notifications.", severity: "error" });
        return;
      }
      setSelected(new Set());
      setPage(0);
      await load();
    } finally {
      setMarkAllBusy(false);
    }
  }

  async function openDetail(n) {
    setDetail(n);
    if (!n.readAt) {
      await fetch(API_BASE, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markRead: true, id: n.id }),
      });
      await load();
    }
  }

  const selectedList = [...selected];
  const unreadOnPage = items.filter((n) => !n.readAt);
  const blockOtherActions = markSelectedBusy || markAllBusy || refreshing;

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy="true" aria-label="Loading notifications">
        <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <div className="space-y-4">
      <Typography variant="body2" sx={adminMutedTextSx}>
        Scoped to your active role.
      </Typography>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="small"
          variant="contained"
          disabled={selectedList.length === 0 || markAllBusy || refreshing}
          onClick={() => void markIdsAsRead(selectedList)}
        >
          {markSelectedBusy ? <CircularProgress size={18} color="inherit" aria-hidden /> : "Mark selected as read"}
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={unreadOnPage.length === 0 || markSelectedBusy || refreshing}
          onClick={() => void markAllRead()}
        >
          {markAllBusy ? <CircularProgress size={18} color="inherit" aria-hidden /> : "Mark all as read"}
        </Button>
        <Button
          size="small"
          variant="text"
          disabled={markSelectedBusy || markAllBusy || refreshing}
          onClick={() => void load()}
        >
          {refreshing ? <CircularProgress size={18} color="inherit" aria-hidden /> : "Refresh"}
        </Button>
      </div>

      {total === 0 ? (
        <Typography sx={adminMutedTextSx}>No notifications yet.</Typography>
      ) : (
        <Box sx={{ position: "relative" }}>
          <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
            <Table size="small" sx={adminTableSx}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      indeterminate={
                        unreadOnPage.some((n) => selected.has(n.id)) &&
                        !unreadOnPage.every((n) => selected.has(n.id))
                      }
                      checked={
                        unreadOnPage.length > 0 && unreadOnPage.every((n) => selected.has(n.id))
                      }
                      onChange={() => toggleAllVisible()}
                      disabled={blockOtherActions}
                      slotProps={{ input: { "aria-label": "Select all unread on this page" } }}
                      sx={{
                        color: "color-mix(in oklab, var(--foreground) 52%, transparent)",
                        "&.Mui-checked": { color: primaryAccent },
                      }}
                    />
                  </TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell width={180}>When</TableCell>
                  <TableCell width={100}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((n) => (
                  <TableRow
                    key={n.id}
                    hover
                    selected={Boolean(detail?.id === n.id)}
                    sx={{ cursor: blockOtherActions ? "default" : "pointer" }}
                    onClick={(e) => {
                      if (blockOtherActions) return;
                      const t = /** @type {HTMLElement} */ (e.target);
                      if (t.closest('input[type="checkbox"]')) return;
                      void openDetail(n);
                    }}
                  >
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        size="small"
                        checked={selected.has(n.id)}
                        disabled={Boolean(n.readAt) || blockOtherActions}
                        onChange={() => toggleOne(n.id)}
                        slotProps={{ input: { "aria-label": `Select ${n.title}` } }}
                        sx={{
                          color: "color-mix(in oklab, var(--foreground) 52%, transparent)",
                          "&.Mui-checked": { color: primaryAccent },
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600} sx={{ color: "var(--foreground)" }}>
                        {n.title}
                      </Typography>
                      <Typography variant="caption" sx={adminMutedTextSx} noWrap component="div">
                        {n.type}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={adminMutedTextSx}>
                        {new Date(n.createdAt).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="caption"
                        sx={n.readAt ? adminMutedTextSx : { color: primaryAccent }}
                      >
                        {n.readAt ? "Read" : "Unread"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
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
            rowsPerPageOptions={[10, 20, 50]}
          />
          {refreshing ? (
            <Box
              sx={adminTableRefetchOverlaySx}
              aria-busy="true"
              aria-label="Updating notifications"
            >
              <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
            </Box>
          ) : null}
        </Box>
      )}

      <Dialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="notif-page-detail-title"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle id="notif-page-detail-title" sx={{ color: "var(--foreground)" }}>
          {detail?.title ?? ""}
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 1 }}>
            {detail?.createdAt ? new Date(detail.createdAt).toLocaleString() : ""}
          </Typography>
          <Typography variant="body2" sx={{ color: "var(--foreground)", whiteSpace: "pre-wrap" }}>
            {detail?.body ?? ""}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetail(null)} sx={{ color: "var(--foreground)" }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
