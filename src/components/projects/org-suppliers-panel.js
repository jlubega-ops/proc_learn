"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddRounded from "@mui/icons-material/AddRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { BRAND_BTN_PRIMARY_CLASS } from "@/lib/brand-ui";

/**
 * @param {{ projectId: string }} p
 */
export function OrgSuppliersPanel({ projectId }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState(/** @type {any[]} */ ([]));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [registrationRef, setRegistrationRef] = useState("");
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/suppliers`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not load suppliers.",
          severity: "error",
        });
        setRows([]);
        return;
      }
      setRows(Array.isArray(data.suppliers) ? data.suppliers : []);
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSupplier(e) {
    e.preventDefault();
    const errors = {};
    if (!name.trim()) errors.name = "Enter a supplier name.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/suppliers`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, registrationRef }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not create supplier.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Supplier saved.", severity: "success" });
      setName("");
      setEmail("");
      setPhone("");
      setRegistrationRef("");
      setFieldErrors({});
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy>
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button startIcon={<RefreshRounded />} variant="outlined" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <Paper component="form" noValidate onSubmit={createSupplier} variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
          Add supplier / provider
        </Typography>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Supplier name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={Boolean(fieldErrors.name)}
            helperText={fieldErrors.name || ""}
            fullWidth
            sx={themedTextFieldSx}
          />
          <TextField
            label="Registration / reference"
            value={registrationRef}
            onChange={(e) => setRegistrationRef(e.target.value)}
            fullWidth
            sx={themedTextFieldSx}
          />
          <TextField
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            sx={themedTextFieldSx}
          />
          <TextField
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            fullWidth
            sx={themedTextFieldSx}
          />
        </div>
        <div className="mt-3">
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            className={BRAND_BTN_PRIMARY_CLASS}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AddRounded />}
          >
            {busy ? "Saving…" : "Save supplier"}
          </Button>
        </div>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Registered suppliers
        </Typography>
        {rows.length === 0 ? (
          <Typography sx={adminMutedTextSx}>
            No suppliers have been registered yet. Add a supplier before issuing RFQs or a purchase
            instruction.
          </Typography>
        ) : (
          <ul className="divide-y divide-[color:var(--border-subtle)] text-sm">
            {rows.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="opacity-70">
                    {[s.email, s.phone, s.registrationRef].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <span className="text-xs font-medium uppercase">{s.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Paper>
    </div>
  );
}
