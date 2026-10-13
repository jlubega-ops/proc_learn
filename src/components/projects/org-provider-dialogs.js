"use client";

import { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import { useToast } from "@/components/providers/toast-provider";
import { useDraftState } from "@/hooks/use-draft-state";
import { useDraftSync } from "@/hooks/use-draft-sync";
import { adminDialogPaperSx, adminMutedTextSx, themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { GENERATE_MIX_OPTIONS, MAX_GENERATE_COUNT } from "@/lib/projects/provider-behaviours";
import { PROVIDER_CATEGORY_OPTIONS } from "@/lib/projects/provider-terms";

/**
 * @param {Response} res
 */
async function readJson(res) {
  return res.json().catch(() => ({}));
}

/**
 * Suspend (reason required) or reactivate a provider in the register.
 * @param {{ projectId: string; provider: any | null; onClose: () => void; onDone: (p: any) => void }} p
 */
export function OrgProviderStatusDialog({ projectId, provider, onClose, onDone }) {
  const { showToast } = useToast();
  const reactivating = provider && provider.status !== "ACTIVE";
  const [reason, setReason, reasonDraft] = useDraftState(`org:provider:${provider?.id}:status-reason`, "", {
    enabled: Boolean(provider) && !reactivating,
    resetKey: provider?.id ?? null,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError("");
  }, [provider]);

  function handleCancel() {
    if (busy) return;
    reasonDraft.clearDraft();
    onClose();
  }

  async function submit(e) {
    e.preventDefault();
    if (!reactivating && !reason.trim()) {
      setError("Enter the suspension reason.");
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/providers/${provider.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          status: reactivating ? "ACTIVE" : "SUSPENDED",
          reason: reason.trim(),
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        if (data.fieldErrors?.reason) setError(data.fieldErrors.reason);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not update the provider.",
          severity: "error",
        });
        return;
      }
      showToast({
        message: reactivating ? "Provider reactivated." : "Provider suspended.",
        severity: "success",
      });
      reasonDraft.clearDraft();
      onDone(data.provider);
    } catch {
      showToast({ message: "Network error. Please try again.", severity: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={Boolean(provider)}
      onClose={handleCancel}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: adminDialogPaperSx } }}
    >
      <form noValidate onSubmit={submit}>
        <DialogTitle>{reactivating ? "Reactivate provider?" : "Suspend provider?"}</DialogTitle>
        <DialogContent className="space-y-3">
          <Typography variant="body2">
            {reactivating ? (
              <>
                <strong>{provider?.name}</strong> will be active in the register again and can be
                shortlisted or selected.
              </>
            ) : (
              <>
                <strong>{provider?.name}</strong> will stay in the register but every eligibility
                check will flag it as suspended.
              </>
            )}
          </Typography>
          {!reactivating ? (
            <TextField
              label="Reason for suspension"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError("");
              }}
              error={Boolean(error)}
              helperText={error || ""}
              multiline
              minRows={2}
              fullWidth
              sx={themedTextFieldSx}
            />
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color={reactivating ? "primary" : "error"}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {busy ? "Saving…" : reactivating ? "Reactivate" : "Suspend"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/**
 * @param {{ projectId: string; provider: any | null; onClose: () => void; onDone: () => void }} p
 */
export function OrgProviderDeleteDialog({ projectId, provider, onClose, onDone }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/providers/${provider.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await readJson(res);
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not delete the provider.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Provider deleted.", severity: "success" });
      onDone();
    } catch {
      showToast({ message: "Network error. Please try again.", severity: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={Boolean(provider)}
      onClose={() => !busy && onClose()}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: adminDialogPaperSx } }}
    >
      <DialogTitle>Delete provider?</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          This permanently removes <strong>{provider?.name}</strong> and its portal login. Providers
          that already appear in procurement records cannot be deleted. Suspend them instead.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          disabled={busy}
          onClick={() => void confirm()}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {busy ? "Deleting…" : "Delete"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * @param {{ open: boolean; projectId: string; onClose: () => void; onDone: (providers: any[]) => void }} p
 */
export function OrgProviderGenerateDialog({ open, projectId, onClose, onDone }) {
  const { showToast } = useToast();
  const [count, setCount] = useState("5");
  const [mix, setMix] = useState("MIXED");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generateDraft = useDraftSync(
    `org:providers:${projectId}:generate`,
    { count, mix, category },
    (d) => {
      if (typeof d.count === "string") setCount(d.count);
      if (typeof d.mix === "string") setMix(d.mix);
      if (typeof d.category === "string") setCategory(d.category);
    },
    { enabled: open },
  );

  useEffect(() => {
    if (open) setError("");
  }, [open]);

  function handleCancel() {
    if (busy) return;
    generateDraft.clearDraft();
    onClose();
  }

  async function submit(e) {
    e.preventDefault();
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > MAX_GENERATE_COUNT) {
      setError(`Enter a whole number between 1 and ${MAX_GENERATE_COUNT}.`);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/providers/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: n, mix, category: category || null }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        if (data.fieldErrors?.count) setError(data.fieldErrors.count);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not generate providers.",
          severity: "error",
        });
        return;
      }
      const list = Array.isArray(data.providers) ? data.providers : [];
      showToast({
        message: `${list.length} provider${list.length === 1 ? "" : "s"} generated.`,
        severity: "success",
      });
      generateDraft.clearDraft();
      onDone(list);
    } catch {
      showToast({ message: "Network error. Please try again.", severity: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: adminDialogPaperSx } }}
    >
      <form noValidate onSubmit={submit} aria-busy={busy}>
        <DialogTitle>Generate providers</DialogTitle>
        <DialogContent className="space-y-3">
          <Typography variant="body2" sx={adminMutedTextSx}>
            Creates fictional providers with realistic details, compliance documents and different
            behaviours (some compliant, some with expired or missing documents).
          </Typography>
          <TextField
            label="How many providers"
            type="number"
            value={count}
            onChange={(e) => {
              setCount(e.target.value);
              if (error) setError("");
            }}
            error={Boolean(error)}
            helperText={error || `1 to ${MAX_GENERATE_COUNT}`}
            fullWidth
            sx={themedTextFieldSx}
            slotProps={{ htmlInput: { min: 1, max: MAX_GENERATE_COUNT, step: 1 } }}
          />
          <TextField
            select
            label="Compliance mix"
            value={mix}
            onChange={(e) => setMix(e.target.value)}
            fullWidth
            sx={themedTextFieldSx}
          >
            {GENERATE_MIX_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            fullWidth
            sx={themedTextFieldSx}
          >
            <MenuItem value="">Any category</MenuItem>
            {PROVIDER_CATEGORY_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            startIcon={
              busy ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeRounded />
            }
          >
            {busy ? "Generating…" : "Generate"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
