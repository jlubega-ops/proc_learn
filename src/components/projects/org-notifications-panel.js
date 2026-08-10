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
import Typography from "@mui/material/Typography";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
} from "@/lib/admin-mui-surfaces";

export function OrgNotificationsPanel() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState(/** @type {any[]} */ ([]));
  const [detail, setDetail] = useState(/** @type {any | null} */ (null));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects/org-notifications", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not load notifications.",
          severity: "error",
        });
        return;
      }
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openItem(row) {
    setDetail(row);
    if (!row.readAt) {
      await fetch("/api/projects/org-notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markRead: true, id: row.id }),
      });
      await load();
    }
  }

  async function markAll() {
    await fetch("/api/projects/org-notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    showToast({ message: "All notifications marked as read.", severity: "success" });
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
          <Button startIcon={<RefreshRounded />} variant="outlined" onClick={() => load()}>
            Refresh
          </Button>
          <Button variant="contained" onClick={() => markAll()}>
            Mark all read
          </Button>
        </div>
        {items.length === 0 ? (
          <Typography sx={adminMutedTextSx}>No notifications yet.</Typography>
        ) : (
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
