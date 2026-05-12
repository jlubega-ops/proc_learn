"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import { useToast } from "@/components/providers/toast-provider";
import { messageForActivationTokenCode } from "@/lib/auth-activation-messages";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
} from "@/lib/admin-mui-surfaces";

function ActivateInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { showToast } = useToast();
  const token = sp.get("t") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState(
    /** @type {{ status: "loading" } | { status: "valid" } | { status: "error"; message: string; code?: string }} */ ({
      status: "loading",
    }),
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/auth/activate?t=${encodeURIComponent(token)}`,
          { credentials: "omit" },
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data.ok === true) {
          setGate({ status: "valid" });
          return;
        }
        const code = typeof data.code === "string" ? data.code : "invalid";
        setGate({
          status: "error",
          code,
          message:
            typeof data.message === "string"
              ? data.message
              : messageForActivationTokenCode(code),
        });
      } catch {
        if (!cancelled) {
          setGate({
            status: "error",
            code: "invalid",
            message: messageForActivationTokenCode("invalid"),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    if (!token) {
      showToast({ message: "Missing activation token.", severity: "error" });
      return;
    }
    if (password !== confirm) {
      showToast({ message: "Passwords do not match.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Activation failed.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Account activated. You can sign in.", severity: "success" });
      router.replace("/login");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Alert severity="warning">
        This page needs a valid link from your email.{" "}
        <Link href="/login" className="font-medium text-primary underline">
          Back to sign in
        </Link>
      </Alert>
    );
  }

  if (gate.status === "loading") {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy="true" aria-label="Checking activation link">
        <CircularProgress size={36} sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  if (gate.status === "error") {
    return (
      <Alert severity="error">
        <Typography variant="body2" sx={{ mb: 1 }}>
          {gate.message}
        </Typography>
        <Typography variant="body2" component="div">
          <Link href="/login" className="font-medium text-primary underline">
            Back to sign in
          </Link>
          {gate.code === "expired" || gate.code === "invalid" ? (
            <>
              {" · "}
              <Link href="/forgot-password" className="font-medium text-primary underline">
                Forgot password
              </Link>
            </>
          ) : null}
        </Typography>
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Typography variant="body2" sx={adminMutedTextSx}>
        Choose a password for your account (at least 8 characters).
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
        {busy ? <CircularProgress size={22} color="inherit" /> : "Activate account"}
      </Button>
      <Typography variant="caption" sx={adminMutedTextSx}>
        <Link href="/login" className="text-primary underline">
          Sign in instead
        </Link>
      </Typography>
    </form>
  );
}

export function ActivateAccountForm() {
  return (
    <Suspense
      fallback={
        <Box sx={adminCenteredLoadingBoxSx}>
          <CircularProgress size={36} sx={adminLoadingSpinnerSx} />
        </Box>
      }
    >
      <ActivateInner />
    </Suspense>
  );
}
