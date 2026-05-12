"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemText from "@mui/material/ListItemText";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Typography from "@mui/material/Typography";
import AccountCircleRounded from "@mui/icons-material/AccountCircleRounded";
import LogoutRounded from "@mui/icons-material/LogoutRounded";
import NotificationsRounded from "@mui/icons-material/NotificationsRounded";
import SwapHorizRounded from "@mui/icons-material/SwapHorizRounded";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { DEFAULT_POST_AUTH_PATH } from "@/lib/appConfig";
import { ROLE_LABELS } from "@/lib/roles";
import { adminDialogPaperSx, adminMutedTextSx } from "@/lib/admin-mui-surfaces";

/**
 * @param {string} displayName
 * @param {string} email
 */
function navbarUserInitials(displayName, email) {
  const name = typeof displayName === "string" ? displayName.trim() : "";
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0][0];
      const b = parts[parts.length - 1][0];
      if (a && b) return (a + b).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length >= 2) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length === 1) {
      return parts[0].toUpperCase();
    }
  }
  const em = typeof email === "string" ? email.trim() : "";
  return em ? em.charAt(0).toUpperCase() : "?";
}

export function NavbarUserMenu() {
  const router = useRouter();
  const { session, refresh, setSessionBlocking } = useAuthSession();
  const [anchor, setAnchor] = useState(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [picked, setPicked] = useState(session?.activeRole ?? "STUDENT");
  const [switchError, setSwitchError] = useState("");
  const [busy, setBusy] = useState(false);
  const [avatarImgBroken, setAvatarImgBroken] = useState(false);

  const email = session?.email || "";
  const displayName =
    typeof session?.displayName === "string" ? session.displayName.trim() : "";
  const imageUrl =
    typeof session?.imageUrl === "string" && session.imageUrl.startsWith("https://")
      ? session.imageUrl
      : "";
  const navLabel =
    displayName || (email.includes("@") ? email.split("@")[0] : email) || "Account";
  const initial = useMemo(
    () => navbarUserInitials(displayName, email),
    [displayName, email],
  );

  useEffect(() => {
    setAvatarImgBroken(false);
  }, [imageUrl]);

  if (!session?.authenticated) return null;

  const canSwitch =
    Array.isArray(session.switchableRoles) &&
    session.switchableRoles.length > 1;

  const closeMenu = () => setAnchor(null);

  async function logout() {
    closeMenu();
    setSessionBlocking(true, "Signing you out…");
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      await refresh();
      router.replace("/login");
    } finally {
      setSessionBlocking(false);
    }
  }

  async function confirmRoleSwitch() {
    setSwitchError("");
    setBusy(true);
    setSessionBlocking(true, "Switching your role…");
    try {
      const res = await fetch("/api/user/active-role", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: picked }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSwitchError(
          typeof data.error === "string"
            ? data.error.toLowerCase()
            : "could not switch role.",
        );
        return;
      }
      setRoleDialogOpen(false);
      closeMenu();
      await refresh();
      router.replace(DEFAULT_POST_AUTH_PATH);
    } finally {
      setBusy(false);
      setSessionBlocking(false);
    }
  }

  return (
    <>
      <div className="flex min-w-0 max-w-[9rem] shrink items-center gap-2 sm:max-w-[13rem] md:max-w-[16rem]">
        <span
          className="hidden min-w-0 truncate text-right text-sm font-medium text-zinc-800 dark:text-zinc-100 sm:block"
          title={displayName || email || undefined}
        >
          {navLabel}
        </span>
        <button
          type="button"
          title="Account menu"
          aria-haspopup="true"
          aria-expanded={Boolean(anchor)}
          aria-label={`Account menu for ${navLabel}`}
          onClick={(e) => setAnchor(e.currentTarget)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-2 ring-zinc-200 hover:ring-[#008bd0]/50 dark:ring-zinc-700"
        >
          <Avatar
            src={!avatarImgBroken && imageUrl ? imageUrl : undefined}
            slotProps={{
              img: {
                onError: () => setAvatarImgBroken(true),
                referrerPolicy: "no-referrer",
              },
            }}
            sx={{ width: 36, height: 36, bgcolor: "#008bd0", fontSize: 16 }}
          >
            {initial}
          </Avatar>
        </button>
      </div>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { ...adminDialogPaperSx, minWidth: 240 } } }}
      >
        <MenuItem
          disabled
          sx={{ cursor: "default", opacity: "1 !important", py: 1.5 }}
        >
          <ListItemText
            primary={displayName || navLabel}
            secondary={email || "—"}
            slotProps={{
              primary: { variant: "body2", fontWeight: 600, noWrap: true },
              secondary: { variant: "caption", noWrap: true },
            }}
          />
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            closeMenu();
            router.push("/notifications");
          }}
        >
          <ListItemIcon>
            <NotificationsRounded fontSize="small" />
          </ListItemIcon>
          Notifications
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeMenu();
            router.push("/profile?tab=details");
          }}
        >
          <ListItemIcon>
            <AccountCircleRounded fontSize="small" />
          </ListItemIcon>
          Profile
        </MenuItem>
        {canSwitch ? (
          <MenuItem
            onClick={() => {
              setPicked(session.activeRole ?? "STUDENT");
              setRoleDialogOpen(true);
              closeMenu();
            }}
          >
            <ListItemIcon>
              <SwapHorizRounded fontSize="small" />
            </ListItemIcon>
            Switch role
          </MenuItem>
        ) : null}
        <Divider />
        <MenuItem
          onClick={logout}
          sx={{
            color: "#f87171",
            "&:hover": { bgcolor: "color-mix(in oklab, #f87171 14%, transparent)" },
          }}
        >
          <ListItemIcon sx={{ color: "#f87171" }}>
            <LogoutRounded fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>

      <Dialog
        open={roleDialogOpen}
        onClose={() => !busy && setRoleDialogOpen(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="role-switch-title"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle id="role-switch-title">Switch active role</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
            Menus and pages follow your active role. Pick the role you want to
            use now.
          </Typography>
          <RadioGroup
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
          >
            {(session.switchableRoles || []).map((r) => (
              <FormControlLabel
                key={r}
                value={r}
                control={<Radio size="small" />}
                label={ROLE_LABELS[r] || r}
              />
            ))}
          </RadioGroup>
          {switchError ? (
            <Typography variant="caption" color="error" sx={{ display: "block", mt: 1 }}>
              {switchError}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => !busy && setRoleDialogOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={confirmRoleSwitch}
            disabled={busy || picked === session.activeRole}
            {...(busy
              ? {
                  startIcon: (
                    <CircularProgress size={20} color="inherit" aria-hidden />
                  ),
                }
              : {})}
          >
            {busy ? "Switching…" : "Switch"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
