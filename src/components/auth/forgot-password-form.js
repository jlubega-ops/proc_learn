"use client";

import Link from "next/link";
import { useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import { useToast } from "@/components/providers/toast-provider";
import { schoolEmailFieldError } from "@/lib/validation/school-email";

export function ForgotPasswordForm() {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState("");
  const [errors, setErrors] = useState(/** @type {{ email?: string }} */ ({}));

  async function submit(e) {
    e.preventDefault();
    setFormError("");
    const next = {};
    const fe = schoolEmailFieldError(email);
    if (fe) {
      next.email = fe;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (
          res.status === 400 &&
          typeof data.fields?.email === "string"
        ) {
          setErrors({ email: data.fields.email });
          return;
        }
        const msg =
          typeof data.error === "string" ? data.error : "Request failed.";
        setFormError(msg);
        showToast({ message: msg, severity: "error" });
        return;
      }
      setDone(true);
      showToast({
        message:
          typeof data.message === "string"
            ? data.message
            : "If an account exists, check your email.",
        severity: "success",
        duration: 6000,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {formError ? (
        <Alert severity="error" onClose={() => setFormError("")}>
          {formError}
        </Alert>
      ) : null}
      {done ? (
        <Alert severity="success">
          If an account exists for that address, password reset instructions were sent.
        </Alert>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Enter your school email. If your account exists we will email a reset link (valid for 1 hour).
        </Typography>
      )}
      <TextField
        label="School email"
        type="email"
        inputMode="email"
        fullWidth
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setFormError("");
          setErrors((prev) => {
            const { email: _e, ...rest } = prev;
            return rest;
          });
        }}
        error={Boolean(errors.email)}
        helperText={errors.email}
        required
        autoComplete="email"
      />
      <Button type="submit" variant="contained" disabled={busy}>
        {busy ? <CircularProgress size={22} color="inherit" /> : "Send reset link"}
      </Button>
      <Typography variant="caption">
        <Link href="/login" className="text-[#008bd0] underline">
          Back to sign in
        </Link>
      </Typography>
    </form>
  );
}
