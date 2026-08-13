"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { useToast } from "@/components/providers/toast-provider";
import { ROLE } from "@/lib/roles";
import { formatCountdownParts } from "@/lib/academic/attempt-timer-format";
import { adminDialogPaperSx } from "@/lib/admin-mui-surfaces";
import { BRAND_PAGE_LEAD_CLASS } from "@/lib/brand-ui";

/**
 * Sticky bar below the navbar while a student is in a Practice/Assessment organisation.
 * Shows live countdown (months/days/hours/mins/seconds) and a green Submit control.
 */
export function ActiveOrgContextBanner() {
  const router = useRouter();
  const { session, refresh } = useAuthSession();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [timer, setTimer] = useState(/** @type {any} */ (null));
  const [deadlineMs, setDeadlineMs] = useState(/** @type {number | null} */ (null));
  const [tickLeft, setTickLeft] = useState(/** @type {number | null} */ (null));
  const [projectName, setProjectName] = useState("");
  const [attemptId, setAttemptId] = useState(/** @type {string | null} */ (null));
  const [academicProjectId, setAcademicProjectId] = useState(/** @type {string | null} */ (null));
  const [purpose, setPurpose] = useState(/** @type {string | null} */ (null));

  const isStudent = session?.authenticated && session?.activeRole === ROLE.STUDENT;
  const kind = session?.orgContext;
  const inAttemptOrg = kind === "PRACTICE" || kind === "ASSESSMENT";

  const poll = useCallback(async () => {
    if (!isStudent || session?.isStudentMode || !inAttemptOrg) return;
    const res = await fetch("/api/student/active-org", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setTimer(data.timer || null);
    setProjectName(data.academicProject?.name || session?.activeAttempt?.projectName || "");
    setAttemptId(data.attemptId || session?.activeAttempt?.attemptId || null);
    setAcademicProjectId(
      data.academicProject?.id || session?.activeAttempt?.academicProjectId || null,
    );
    setPurpose(data.academicProject?.purpose || session?.activeAttempt?.purpose || kind);
    if (data.timer?.deadlineAt) {
      const ms = new Date(data.timer.deadlineAt).getTime();
      setDeadlineMs(Number.isFinite(ms) ? ms : null);
    } else if (typeof data.timer?.remainingSeconds === "number") {
      setDeadlineMs(Date.now() + data.timer.remainingSeconds * 1000);
    } else {
      setDeadlineMs(null);
      setTickLeft(null);
    }
    if (data.autoExpired) {
      showToast({
        message: "Time expired. Your attempt was submitted automatically.",
        severity: "success",
      });
      await refresh();
      router.replace(
        data.academicProject?.purpose === "ASSESSMENT"
          ? "/academic/assessments"
          : "/academic/practice",
      );
    }
  }, [
    isStudent,
    session?.isStudentMode,
    inAttemptOrg,
    session?.activeAttempt?.projectName,
    session?.activeAttempt?.attemptId,
    session?.activeAttempt?.academicProjectId,
    session?.activeAttempt?.purpose,
    kind,
    showToast,
    refresh,
    router,
  ]);

  useEffect(() => {
    if (!isStudent || session?.isStudentMode || !inAttemptOrg) return undefined;
    void poll();
    const id = window.setInterval(() => void poll(), 10000);
    return () => window.clearInterval(id);
  }, [isStudent, session?.isStudentMode, inAttemptOrg, poll]);

  useEffect(() => {
    if (deadlineMs == null) {
      setTickLeft(null);
      return undefined;
    }
    const tick = () => {
      setTickLeft(Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [deadlineMs]);

  async function submitAttempt() {
    if (!academicProjectId || !attemptId) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(academicProjectId)}/attempts/${encodeURIComponent(attemptId)}/submit`,
        { method: "POST", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not submit.",
          severity: "error",
        });
        return;
      }
      setSubmitOpen(false);
      showToast({ message: "Attempt submitted.", severity: "success" });
      await refresh();
      router.replace(purpose === "ASSESSMENT" ? "/academic/assessments" : "/academic/practice");
    } finally {
      setBusy(false);
    }
  }

  if (!isStudent || session?.isStudentMode) return null;
  if (!inAttemptOrg) return null;

  const orgName = session?.activeOrgName || "this organisation";
  const remaining = tickLeft ?? timer?.remainingSeconds;
  const hasTimer = timer?.mode !== "NONE" && remaining != null;
  const expired = Boolean(timer?.expired) || (hasTimer && remaining === 0);
  const urgent = hasTimer && !expired && remaining != null && remaining <= 5 * 60;
  const parts = hasTimer ? formatCountdownParts(remaining) : null;
  const canSubmit = Boolean(attemptId && academicProjectId);

  return (
    <>
      <div
        className={`z-20 shrink-0 border-b ${
          urgent || expired
            ? "attempt-timer-urgent border-brand-red bg-[color:var(--brand-red)] text-white"
            : "border-brand-red/40 bg-white text-[color:var(--brand-red)] dark:bg-zinc-950"
        }`}
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide opacity-90">
              {kind === "ASSESSMENT" ? "Assessment organisation" : "Practice organisation"}
            </p>
            <p className="truncate text-sm font-semibold">
              {orgName}
              {projectName ? ` · ${projectName}` : ""}
            </p>
            <p className="text-xs opacity-90">
              You are not in your default My Organisation. Work here is for this project only.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {hasTimer ? (
              <div
                className={`rounded-lg px-3 py-1.5 font-mono text-sm font-bold tabular-nums ${
                  urgent || expired
                    ? "bg-white/15 text-white"
                    : "bg-[color:var(--brand-red)] text-white"
                }`}
                title={
                  timer?.mode === "DURATION"
                    ? "Timed attempt — does not pause on logout"
                    : "Time until this project closes"
                }
              >
                {expired ? "Time up" : `Time left · ${parts?.label || "—"}`}
              </div>
            ) : (
              <div
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  urgent || expired
                    ? "bg-white/15 text-white"
                    : "border border-brand-red/30 bg-white text-[color:var(--brand-red)] dark:bg-zinc-900"
                }`}
              >
                No timed limit
              </div>
            )}

            <Button
              variant="contained"
              color="success"
              size="small"
              disabled={busy || !canSubmit || expired}
              className="cursor-pointer disabled:cursor-not-allowed"
              onClick={() => setSubmitOpen(true)}
              title="Submit your attempt for this project"
              aria-label="Submit attempt"
            >
              Submit
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={submitOpen}
        onClose={() => !busy && setSubmitOpen(false)}
        PaperProps={{ sx: adminDialogPaperSx }}
      >
        <DialogTitle>Submit this attempt?</DialogTitle>
        <DialogContent>
          <p className={BRAND_PAGE_LEAD_CLASS}>
            Submitting locks this attempt for grading. Make sure you have finished the required
            procurement work. You can still use Exit organisation for practice work only when the
            examiner allows leaving.
          </p>
        </DialogContent>
        <DialogActions>
          <Button className="cursor-pointer" onClick={() => setSubmitOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="cursor-pointer disabled:cursor-not-allowed"
            variant="contained"
            color="success"
            disabled={busy}
            onClick={() => void submitAttempt()}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            Submit attempt
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/**
 * Red Exit organisation control for the bottom of the student sidebar.
 */
export function StudentExitOrgSidebarButton({ onNavigate }) {
  const router = useRouter();
  const { session, refresh } = useAuthSession();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const isStudent = session?.authenticated && session?.activeRole === ROLE.STUDENT;
  const kind = session?.orgContext;
  const inAttemptOrg = kind === "PRACTICE" || kind === "ASSESSMENT";
  const locked = Boolean(session?.assessmentLocked) || kind === "ASSESSMENT";

  if (!isStudent || session?.isStudentMode || !inAttemptOrg) return null;

  async function leavePractice() {
    setBusy(true);
    try {
      const res = await fetch("/api/student/active-org", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "personal" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not leave this organisation.",
          severity: "error",
        });
        return;
      }
      onNavigate?.();
      await refresh();
      showToast({ message: "Returned to your default organisation.", severity: "success" });
      router.replace("/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-[color:var(--border-subtle)] p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-brand-red">
        Project organisation
      </p>
      <Button
        fullWidth
        variant="contained"
        color="error"
        disabled={busy || locked}
        className="cursor-pointer disabled:cursor-not-allowed"
        onClick={() => void leavePractice()}
        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
        title={
          locked
            ? "You cannot leave an assessment organisation until the assessment window closes."
            : "Leave this project organisation and return to My Organisation"
        }
        aria-label={
          locked ? "Exit organisation (disabled for assessment)" : "Exit organisation"
        }
      >
        {locked ? "Exit organisation (locked)" : "Exit organisation"}
      </Button>
    </div>
  );
}
