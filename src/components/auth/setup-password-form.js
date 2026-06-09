"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { useToast } from "@/components/providers/toast-provider";

export function SetupPasswordForm() {
  const { setSessionBlocking, signOut } = useAuthSession();
  const { showToast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (password !== confirm) {
      showToast({ message: "Passwords do not match.", severity: "error" });
      return;
    }
    setBusy(true);
    setSessionBlocking(true, "Saving your password…");
    let redirecting = false;
    try {
      const res = await fetch("/api/user/setup-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password, confirmPassword: confirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save password.",
          severity: "error",
        });
        return;
      }
      redirecting = true;
      await signOut({
        redirectTo: "/login",
        message: "Redirecting to sign in…",
        toast: {
          message: "Password saved. Sign in again with your new password.",
          severity: "success",
        },
      });
    } finally {
      setBusy(false);
      if (!redirecting) {
        setSessionBlocking(false);
      }
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <Typography variant="body2" color="text.secondary">
        Your first sign-in used a temporary password. Choose a new password (at least 8
        characters). Do not use your student number.
      </Typography>
      <TextField
        label="New password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        fullWidth
        autoComplete="new-password"
      />
      <TextField
        label="Confirm password"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        fullWidth
        autoComplete="new-password"
      />
      <Button type="submit" variant="contained" disabled={busy} className="h-11">
        {busy ? <CircularProgress size={22} color="inherit" aria-hidden /> : "Save and sign in"}
      </Button>
    </form>
  );
}
