"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import NotificationsRounded from "@mui/icons-material/NotificationsRounded";
import { adminDialogPaperSx, adminMutedTextSx } from "@/lib/admin-mui-surfaces";

/** Quiet badge refresh while the shell is open — not on every sidebar click. */
const SUMMARY_POLL_MS = 60_000;

/**
 * @param {{ apiBase?: string; viewAllHref?: string }} [props]
 */
export function NotificationBellMenu({
  apiBase = "/api/user/notifications",
  viewAllHref = "/notifications",
}) {
  const [anchor, setAnchor] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preview, setPreview] = useState(/** @type {any[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [dialogItem, setDialogItem] = useState(/** @type {any | null} */ (null));
  const menuOpenRef = useRef(false);

  const loadSummary = useCallback(async ({ showSpinner = false } = {}) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch(`${apiBase}?summary=1`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUnreadCount(0);
        setPreview([]);
        return;
      }
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
      setPreview(Array.isArray(data.preview) ? data.preview : []);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [apiBase]);

  // Mount + when apiBase changes (academic vs org inbox). Identity switches hard-nav / clear SWR.
  useEffect(() => {
    void loadSummary({ showSpinner: !menuOpenRef.current });
  }, [loadSummary]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadSummary({ showSpinner: false });
    }, SUMMARY_POLL_MS);
    return () => window.clearInterval(id);
  }, [loadSummary]);

  const openMenu = (e) => {
    setAnchor(e.currentTarget);
    menuOpenRef.current = true;
    void loadSummary({ showSpinner: true });
  };

  const closeMenu = () => {
    menuOpenRef.current = false;
    setAnchor(null);
  };

  function openDetail(n) {
    closeMenu();
    setDialogItem(n);
    void fetch(apiBase, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markRead: true, id: n.id }),
    }).then(() => loadSummary());
  }

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          type="button"
          aria-label="Open notifications menu"
          aria-haspopup="true"
          aria-expanded={Boolean(anchor)}
          size="small"
          onClick={openMenu}
          className="inline-flex text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Badge
            badgeContent={unreadCount > 99 ? "99+" : unreadCount}
            color="error"
            invisible={unreadCount === 0}
            max={99}
          >
            <NotificationsRounded sx={{ fontSize: 22, color: "#008bd0" }} />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: { ...adminDialogPaperSx, minWidth: 300, maxWidth: 380 },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ color: "var(--foreground)" }}>
            Unread
          </Typography>
          <Typography variant="caption" sx={adminMutedTextSx}>
            Showing up to 5 unread alerts.
          </Typography>
        </Box>
        <Divider />
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={28} sx={{ color: "#008bd0" }} />
          </Box>
        ) : preview.length === 0 ? (
          <Box sx={{ px: 2, py: 2 }}>
            <Typography variant="body2" sx={adminMutedTextSx}>
              No unread notifications.
            </Typography>
          </Box>
        ) : (
          preview.map((n) => (
            <ListItemButton key={n.id} dense onClick={() => void openDetail(n)}>
              <ListItemText
                primary={n.title}
                secondary={new Date(n.createdAt).toLocaleString()}
                slotProps={{
                  primary: { noWrap: true, variant: "body2", fontWeight: 600 },
                  secondary: { variant: "caption" },
                }}
              />
            </ListItemButton>
          ))
        )}
        <Divider />
        <Box sx={{ px: 1, py: 1, display: "flex", justifyContent: "flex-end" }}>
          <Button
            component={Link}
            href={viewAllHref}
            size="small"
            onClick={closeMenu}
          >
            View all
          </Button>
        </Box>
      </Menu>

      <Dialog
        open={Boolean(dialogItem)}
        onClose={() => setDialogItem(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="notif-detail-title"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle id="notif-detail-title">
          {dialogItem?.title ?? "Notification"}
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 1 }}>
            {dialogItem?.createdAt
              ? new Date(dialogItem.createdAt).toLocaleString()
              : ""}
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", color: "var(--foreground)" }}>
            {dialogItem?.body ?? ""}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogItem(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
