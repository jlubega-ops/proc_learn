"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Paper from "@mui/material/Paper";
import TablePagination from "@mui/material/TablePagination";
import Typography from "@mui/material/Typography";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { useToast } from "@/components/providers/toast-provider";
import { useApi } from "@/hooks/use-api";
import { revalidateApi } from "@/lib/api-client-cache";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
} from "@/lib/admin-mui-surfaces";

const API_BASE = "/api/projects/org-notifications";

export function OrgNotificationsPanel() {
  const { showToast } = useToast();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
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

  const load = useCallback(async () => {
    await reload();
    void revalidateApi(API_BASE);
  }, [reload]);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(total / rowsPerPage) || 1);
    if (page > 0 && page >= pageCount) setPage(pageCount - 1);
  }, [total, rowsPerPage, page]);

  async function openItem(row) {
    setDetail(row);
    if (!row.readAt) {
      await fetch(API_BASE, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markRead: true, id: row.id }),
      });
      await load();
    }
  }

  async function markAll() {
    await fetch(API_BASE, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    showToast({ message: "All notifications marked as read.", severity: "success" });
    setPage(0);
    await load();
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy>
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <>
      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshRounded />}
            variant="outlined"
            onClick={() => void load()}
            disabled={refreshing}
          >
            Refresh
          </Button>
          <Button variant="contained" onClick={() => void markAll()} disabled={refreshing}>
            Mark all read
          </Button>
        </div>
        {total === 0 ? (
          <Typography sx={adminMutedTextSx}>No notifications yet.</Typography>
        ) : (
          <>
            <ul className="space-y-2">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="w-full cursor-pointer rounded-lg border border-[color:var(--border-subtle)] p-3 text-left"
                    onClick={() => void openItem(n)}
                  >
                    <p className="font-semibold">
                      {!n.readAt ? "● " : ""}
                      {n.title}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {String(n.createdAt).slice(0, 19).replace("T", " ")}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
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
          </>
        )}
      </Paper>

      <Dialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>{detail?.title || "Notification"}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {detail?.body || ""}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetail(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
