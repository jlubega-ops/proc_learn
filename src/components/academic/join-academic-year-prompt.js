"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { useToast } from "@/components/providers/toast-provider";
import { adminDialogPaperSx, adminMutedTextSx } from "@/lib/admin-mui-surfaces";
import { ROLE } from "@/lib/roles";

function dismissKey(ayId) {
  return `proc_learn_join_ay_dismissed_${ayId}`;
}

/**
 * Soft prompt when a student is not enrolled in the current academic year.
 * Never shown in Student Mode (demo context is auto-ensured on switch).
 */
export function JoinAcademicYearPrompt() {
  const { session, loading } = useAuthSession();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState(
    /** @type {null | { previousLabel: string | null; currentLabel: string; currentAcademicYearId: string; reason: string }} */ (
      null
    ),
  );
  const [enrollmentLabel, setEnrollmentLabel] = useState(/** @type {string | null} */ (null));
  const [semesterLabel, setSemesterLabel] = useState(/** @type {string | null} */ (null));

  const activeRole = session?.activeRole || "";
  const isStudent =
    !loading && session?.authenticated === true && activeRole === ROLE.STUDENT;
  const isStudentMode = Boolean(session?.isStudentMode);

  const load = useCallback(async () => {
    if (!isStudent) return;
    try {
      const res = await fetch("/api/student/academic-context", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const activeLabel = data?.enrollment?.academicYear?.label || null;
      setEnrollmentLabel(typeof activeLabel === "string" ? activeLabel : null);
      const semName = data?.semester?.name || null;
      setSemesterLabel(typeof semName === "string" ? semName : null);

      // Student Mode: never show the join dialog.
      if (isStudentMode) {
        setPrompt(null);
        setOpen(false);
        return;
      }

      const jp = data?.joinPrompt;
      if (
        jp &&
        typeof jp.currentLabel === "string" &&
        typeof jp.currentAcademicYearId === "string"
      ) {
        if (typeof sessionStorage !== "undefined") {
          const dismissed = sessionStorage.getItem(dismissKey(jp.currentAcademicYearId));
          if (dismissed === "1") {
            setPrompt(null);
            setOpen(false);
            return;
          }
        }
        setPrompt({
          previousLabel: typeof jp.previousLabel === "string" ? jp.previousLabel : null,
          currentLabel: jp.currentLabel,
          currentAcademicYearId: jp.currentAcademicYearId,
          reason: typeof jp.reason === "string" ? jp.reason : "previous_year",
        });
        setOpen(true);
      } else {
        setPrompt(null);
        setOpen(false);
      }
    } catch {
      // Non-blocking; students can continue without the prompt.
    }
  }, [isStudent, isStudentMode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function joinNow() {
    if (!prompt) return;
    setBusy(true);
    try {
      const res = await fetch("/api/student/academic-enrollment/join-current", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message:
            typeof data.error === "string" ? data.error : "Could not join the academic year.",
          severity: "error",
        });
        return;
      }
      showToast({
        message: `You joined Academic Year ${prompt.currentLabel}.`,
        severity: "success",
      });
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(dismissKey(prompt.currentAcademicYearId));
      }
      setOpen(false);
      setPrompt(null);
      setEnrollmentLabel(prompt.currentLabel);
    } finally {
      setBusy(false);
    }
  }

  function notNow() {
    if (prompt && typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(dismissKey(prompt.currentAcademicYearId), "1");
    }
    setOpen(false);
  }

  if (!isStudent) return null;

  return (
    <>
      {enrollmentLabel && !open && !isStudentMode ? (
        <div className="mb-3 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--nav-active-bg)] px-3 py-2 text-sm text-foreground">
          <p>Academic Year: {enrollmentLabel}</p>
          {semesterLabel ? (
            <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">Semester: {semesterLabel}</p>
          ) : null}
        </div>
      ) : null}

      {/* Student Mode: compact AY/semester line under the Student Mode banner */}
      {enrollmentLabel && !open && isStudentMode ? (
        <div className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Academic Year: {enrollmentLabel}
          {semesterLabel ? ` · ${semesterLabel}` : ""}
        </div>
      ) : null}

      <Dialog
        open={open}
        onClose={() => {
          if (!busy) notNow();
        }}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: adminDialogPaperSx }}
        aria-labelledby="join-ay-title"
      >
        <DialogTitle id="join-ay-title">Join the current academic year?</DialogTitle>
        <DialogContent>
          {prompt ? (
            <Typography component="div" sx={{ ...adminMutedTextSx, color: "var(--foreground)" }}>
              {prompt.previousLabel ? (
                <>
                  <p className="mb-2">Your current enrollment is {prompt.previousLabel}.</p>
                  <p className="mb-2">The current academic year is {prompt.currentLabel}.</p>
                  <p>Would you like to join {prompt.currentLabel}?</p>
                </>
              ) : (
                <>
                  <p className="mb-2">You are not enrolled in an academic year yet.</p>
                  <p className="mb-2">The current academic year is {prompt.currentLabel}.</p>
                  <p>Would you like to join {prompt.currentLabel}?</p>
                </>
              )}
              <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
                Joining keeps your previous academic year history. Your past work is not deleted.
              </p>
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions className="flex flex-wrap gap-2 px-6 pb-4">
          <Button
            type="button"
            onClick={notNow}
            disabled={busy}
            className="cursor-pointer disabled:cursor-not-allowed"
          >
            Not now
          </Button>
          <Button
            type="button"
            variant="contained"
            color="primary"
            onClick={() => void joinNow()}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
            className="cursor-pointer disabled:cursor-not-allowed"
          >
            {busy ? "Joining…" : "Join now"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
