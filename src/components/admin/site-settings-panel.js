"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import AutorenewRounded from "@mui/icons-material/AutorenewRounded";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import ConstructionRounded from "@mui/icons-material/ConstructionRounded";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { BRAND_CARD_CLASS } from "@/lib/brand-ui";

const ENDPOINT = "/api/admin/site-settings";

const CONFIRM_COPY = {
  enable: {
    title: "Put the site under maintenance?",
    body: "Only system admins will be able to use Proc Learn. Everyone else sees the maintenance page.",
    action: "Turn on",
    color: "error",
  },
  disable: {
    title: "Bring the site back online?",
    body: "Everyone will be able to sign in again.",
    action: "Turn off",
    color: "primary",
  },
  regenerate: {
    title: "Generate a new sign-in link?",
    body: "The current link will stop working.",
    action: "Generate",
    color: "error",
  },
};

export function SiteSettingsPanel() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load site settings.");
      setSettings(data.settings);
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Could not load site settings.", severity: "error" });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!confirm) return;
    const body =
      confirm === "regenerate"
        ? { regenerateBypassToken: true }
        : { maintenanceEnabled: confirm === "enable" };
    setSaving(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save site settings.");
      setSettings(data.settings);
      setConfirm(null);
      showToast({
        message:
          confirm === "regenerate"
            ? "New sign-in link generated."
            : confirm === "enable"
              ? "Site is now under maintenance."
              : "Site is back online.",
        severity: "success",
      });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Could not save site settings.", severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const bypassUrl = settings?.bypassPath && origin ? `${origin}${settings.bypassPath}` : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(bypassUrl);
      showToast({ message: "Link copied.", severity: "success" });
    } catch {
      showToast({ message: "Could not copy the link. Select it and copy manually.", severity: "error" });
    }
  };

  if (loading && !settings) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
        <CircularProgress size={28} sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  const enabled = Boolean(settings?.maintenanceEnabled);
  const copy = confirm ? CONFIRM_COPY[confirm] : null;

  return (
    <div className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ConstructionRounded sx={{ color: enabled ? "var(--brand-red)" : "var(--brand-blue)" }} aria-hidden />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Site under maintenance</h2>
              <Chip
                size="small"
                label={enabled ? "On" : "Off"}
                color={enabled ? "error" : "success"}
              />
            </div>
            {enabled && settings?.maintenanceStartedAt ? (
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                Since {format(new Date(settings.maintenanceStartedAt), "MMM d, yyyy h:mm a")}
              </p>
            ) : null}
          </div>
        </div>
        <Tooltip title={enabled ? "Turn maintenance off" : "Turn maintenance on"}>
          <Switch
            checked={enabled}
            onChange={() => setConfirm(enabled ? "disable" : "enable")}
            disabled={saving}
            color="error"
            slotProps={{ input: { "aria-label": "Site under maintenance" } }}
          />
        </Tooltip>
      </div>

      <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <TextField
          fullWidth
          label="Admin sign-in link"
          value={bypassUrl}
          helperText="Use this to sign in while maintenance is on."
          sx={themedTextFieldSx}
          slotProps={{
            input: {
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Copy link">
                    <span>
                      <IconButton aria-label="Copy admin sign-in link" onClick={copyLink} disabled={!bypassUrl} color="primary" edge="end">
                        <ContentCopyRounded fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Generate a new link">
                    <span>
                      <IconButton aria-label="Generate a new admin sign-in link" onClick={() => setConfirm("regenerate")} disabled={saving} color="error" edge="end">
                        <AutorenewRounded fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </InputAdornment>
              ),
            },
          }}
        />
      </div>

      <Dialog
        open={Boolean(copy)}
        onClose={() => (saving ? null : setConfirm(null))}
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
        maxWidth="xs"
        fullWidth
      >
        {copy ? (
          <>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ color: "inherit" }}>{copy.body}</DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirm(null)} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="contained"
                color={copy.color}
                onClick={save}
                disabled={saving}
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
              >
                {saving ? "Saving…" : copy.action}
              </Button>
            </DialogActions>
          </>
        ) : null}
      </Dialog>
    </div>
  );
}
