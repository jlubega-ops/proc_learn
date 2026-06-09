"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import { useToast } from "@/components/providers/toast-provider";

function ResetInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { showToast } = useToast();
  const token = sp.get("t") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!token) {
      showToast({ message: "Missing reset token.", severity: "error" });
      return;
    }
    if (password !== confirm) {
      showToast({ message: "Passwords do not match.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Reset failed.",
          severity: "error",
        });
        return;
      }
      showToast({
        message: "Password updated. Sign in again with your new password.",
        severity: "success",
      });
      router.replace("/login");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Alert severity="warning">
        Invalid or expired link.{" "}
        <Link href="/forgot-password" className="font-medium text-[#008bd0] underline">
          Request a new reset
        </Link>
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Typography variant="body2" color="text.secondary">
        Choose a new password (at least 8 characters).
      </Typography>
      <TextField
        label="New password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="new-password"
      />
      <TextField
        label="Confirm password"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        autoComplete="new-password"
      />
      <Button type="submit" variant="contained" disabled={busy}>
        {busy ? <CircularProgress size={22} color="inherit" /> : "Update password"}
      </Button>
      <Typography variant="caption">
        <Link href="/login" className="text-[#008bd0] underline">
          Sign in
        </Link>
      </Typography>
    </form>
  );
}

export function ResetPasswordForm() {
  return (
    <Suspense fallback={<CircularProgress />}>
      <ResetInner />
    </Suspense>
  );
}
