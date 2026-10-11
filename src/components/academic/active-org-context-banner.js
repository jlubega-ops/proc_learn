"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TimerRounded from "@mui/icons-material/TimerRounded";
import TaskAltRounded from "@mui/icons-material/TaskAltRounded";
import LogoutRounded from "@mui/icons-material/LogoutRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useConfirm } from "@/components/providers/confirm-provider";
import { ROLE } from "@/lib/roles";
import { adminDialogPaperSx } from "@/lib/admin-mui-surfaces";
import { BRAND_PAGE_LEAD_CLASS } from "@/lib/brand-ui";
import { useServerSyncedCountdown } from "@/hooks/use-server-synced-countdown";

const POLL_MS = 10_000;
const MEMBER_POLL_MS = 15_000;
const EXPIRY_RETRY_MS = 2_000;
const URGENT_SECONDS = 5 * 60;

/** @param {boolean} isAssessment */
export function startAttemptConfirmOptions(isAssessment) {
  return {
    title: isAssessment ? "Start this assessment?" : "Start this practice?",
    message: isAssessment
      ? "You will move into this project's organisation and the timer starts now. It keeps running if you sign out or close the browser. You cannot leave until you submit, and work is submitted automatically when time runs out."
      : "You will move into this project's organisation and the timer starts now. It keeps running if you sign out or close the browser. Work is submitted automatically when time runs out.",
    confirmLabel: "Start",
    color: /** @type {const} */ ("primary"),
  };
}

/** @param {boolean} isAssessment */
function submitConfirmOptions(isAssessment) {
  return {
    title: isAssessment ? "Submit and finish this assessment?" : "Submit and finish this practice?",
    message: isAssessment
      ? "Your work goes to the examiner for marking. You cannot change it or attempt this assessment again."
      : "Your work goes to the examiner and this attempt closes. You cannot change it afterwards.",
    confirmLabel: "Submit",
    color: /** @type {const} */ ("success"),
  };
}

const LEAVE_CONFIRM = {
  title: "Leave this practice?",
  message:
    "You will return to your own organisation. Your work is kept, but the timer keeps running. Come back before it ends or it is submitted automatically.",
  confirmLabel: "Leave",
  color: /** @type {const} */ ("warning"),
};

const MEMBER_SUBMIT_CONFIRM = {
  title: "Submit this project for the student?",
  message:
    "The student's work goes to the examiner for marking. Nobody in this organisation can change it afterwards.",
  confirmLabel: "Submit",
  color: /** @type {const} */ ("success"),
};

/** @param {number | null | undefined} sec */
function formatHms(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return [h, m, r].map((n) => String(n).padStart(2, "0")).join(":");
}

/**
 * Countdown pill + layout shared by the student and the organisation-member bars.
 * @param {{
 *   isAssessment: boolean;
 *   title: string;
 *   timer: any;
 *   remaining: number | null | undefined;
 *   timeUp: boolean;
 *   locked?: boolean;
 *   children?: import("react").ReactNode;
 * }} props
 */
function AttemptBar({ isAssessment, title, timer, remaining, timeUp, locked = false, children }) {
  const hasTimer = Boolean(timer && timer.mode !== "NONE" && remaining != null);
  const urgent = !locked && hasTimer && (timeUp || (remaining != null && remaining <= URGENT_SECONDS));
  return (
    <div
      className={`border-t ${
        urgent
          ? "attempt-timer-urgent border-brand-red bg-[color:var(--brand-red)] text-white"
          : "border-brand-red/40 bg-[color:var(--surface-elevated)] text-foreground"
      }`}
      role="region"
      aria-label="Project attempt"
    >
      <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div className="min-w-0">
          <p
            className={`text-[11px] font-bold uppercase tracking-wide ${
              urgent ? "text-white/90" : isAssessment ? "text-brand-red" : "text-primary"
            }`}
          >
            {isAssessment ? "Assessment" : "Practice"}
          </p>
          <p className="truncate text-sm font-semibold">{title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {locked ? (
            <Chip
              size="small"
              color="success"
              icon={<LockRounded />}
              label="Submitted · Read only"
            />
          ) : (
            <div
              role="timer"
              aria-live="off"
              aria-label={hasTimer ? `Time left ${formatHms(remaining)}` : "No time limit"}
              title={
                timer?.mode === "DURATION"
                  ? "Time left. Keeps running if anyone signs out."
                  : timer?.mode === "WINDOW"
                    ? "Time until this project closes"
                    : "No time limit"
              }
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-sm font-bold tabular-nums ${
                urgent ? "bg-white/15 text-white" : "bg-[color:var(--brand-red)] text-white"
              }`}
            >
              <TimerRounded aria-hidden sx={{ fontSize: 18 }} />
              {!hasTimer ? "No time limit" : timeUp ? "00:00:00" : formatHms(remaining)}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

/** Blocking dialog shown while the server auto-submits an expired attempt. */
function TimeUpDialog({ open }) {
  return (
    <Dialog open={open} disableEscapeKeyDown PaperProps={{ sx: adminDialogPaperSx }}>
      <DialogTitle>Your time is up</DialogTitle>
      <DialogContent>
        <div className="flex items-center gap-3" role="status" aria-busy="true">
          <CircularProgress size={22} />
          <p className={BRAND_PAGE_LEAD_CLASS}>Submitting the work automatically…</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Sticky bar while a student is inside a Practice / Assessment organisation:
 * server-synced countdown, Submit, and (practice only) Leave practice.
 */
export function ActiveOrgContextBanner() {
  const router = useRouter();
  const { session, refresh } = useAuthSession();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(/** @type {'' | 'submit' | 'leave'} */ (""));
  const [timer, setTimer] = useState(/** @type {any} */ (null));
  const [projectName, setProjectName] = useState("");
  const [attemptId, setAttemptId] = useState(/** @type {string | null} */ (null));
  const [academicProjectId, setAcademicProjectId] = useState(/** @type {string | null} */ (null));
  const [purpose, setPurpose] = useState(/** @type {string | null} */ (null));
  const finishedRef = useRef(false);

  const { remainingSeconds: tickLeft, expired: tickExpired } = useServerSyncedCountdown(timer);

  const isStudent = session?.authenticated && session?.activeRole === ROLE.STUDENT;
  const kind = session?.orgContext;
  const inAttemptOrg = kind === "PRACTICE" || kind === "ASSESSMENT";
  const enabled = Boolean(isStudent && !session?.isStudentMode && inAttemptOrg);
  const isAssessment = (purpose || kind) === "ASSESSMENT";
  const listHref = isAssessment ? "/academic/assessments" : "/academic/practice";

  const finish = useCallback(
    async (message) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      showToast({ message, severity: "success" });
      await refresh();
      router.replace(listHref);
    },
    [listHref, refresh, router, showToast],
  );

  const poll = useCallback(async () => {
    if (!enabled) return;
    const res = await fetch("/api/student/active-org", { credentials: "include", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setTimer(data.timer || null);
    setProjectName(data.academicProject?.name || session?.activeAttempt?.projectName || "");
    setAttemptId(data.attemptId || session?.activeAttempt?.attemptId || null);
    setAcademicProjectId(
      data.academicProject?.id || session?.activeAttempt?.academicProjectId || null,
    );
    setPurpose(data.academicProject?.purpose || session?.activeAttempt?.purpose || kind);
    if (data.autoExpired) {
      await finish("Time is up. Your attempt was submitted.");
    } else if (data.kind === "PERSONAL") {
      await finish("This attempt has ended.");
    }
  }, [enabled, session?.activeAttempt, kind, finish]);

  useEffect(() => {
    if (!enabled) return undefined;
    finishedRef.current = false;
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, poll]);

  const remaining = tickLeft ?? timer?.remainingSeconds;
  const hasTimer = Boolean(timer && timer.mode !== "NONE" && remaining != null);
  const timeUp = Boolean(enabled && hasTimer && (tickExpired || timer?.expired || remaining === 0));

  useEffect(() => {
    if (!timeUp) return undefined;
    void poll();
    const id = window.setInterval(() => void poll(), EXPIRY_RETRY_MS);
    return () => window.clearInterval(id);
  }, [timeUp, poll]);

  async function submitAttempt() {
    if (!academicProjectId || !attemptId) return;
    if (!(await confirm(submitConfirmOptions(isAssessment)))) return;
    setBusy("submit");
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
      await finish("Attempt submitted.");
    } finally {
      setBusy("");
    }
  }

  async function leavePractice() {
    if (!(await confirm(LEAVE_CONFIRM))) return;
    setBusy("leave");
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
      await refresh();
      showToast({ message: "Back in your organisation.", severity: "success" });
      router.replace("/");
    } finally {
      setBusy("");
    }
  }

  if (!enabled) return null;

  const orgName = session?.activeOrgName || "Project organisation";
  const title = projectName && orgName !== projectName ? `${projectName} · ${orgName}` : projectName || orgName;
  const canSubmit = Boolean(attemptId && academicProjectId);

  return (
    <>
      <AttemptBar
        isAssessment={isAssessment}
        title={title}
        timer={timer}
        remaining={remaining}
        timeUp={timeUp}
      >
        {!isAssessment ? (
          <Button
            variant="outlined"
            size="small"
            color="warning"
            disabled={Boolean(busy) || timeUp}
            className="cursor-pointer bg-[color:var(--surface-elevated)] disabled:cursor-not-allowed"
            onClick={() => void leavePractice()}
            startIcon={busy === "leave" ? <CircularProgress size={14} color="inherit" /> : <LogoutRounded />}
            title="Return to your organisation. You can come back while time remains."
            aria-label="Leave practice"
          >
            Leave practice
          </Button>
        ) : null}
        <Button
          variant="contained"
          color="success"
          size="small"
          disabled={Boolean(busy) || !canSubmit || timeUp}
          className="cursor-pointer disabled:cursor-not-allowed"
          onClick={() => void submitAttempt()}
          startIcon={busy === "submit" ? <CircularProgress size={14} color="inherit" /> : <TaskAltRounded />}
          title="Finish and submit this attempt"
          aria-label="Submit attempt"
        >
          Submit
        </Button>
      </AttemptBar>
      <TimeUpDialog open={timeUp} />
    </>
  );
}

/**
 * Same bar for organisation users and providers signed in to a student's attempt organisation:
 * they see the student's remaining time and may submit on the student's behalf.
 * Renders nothing outside attempt organisations.
 *
 * @param {{ enabled?: boolean }} props
 */
export function AttemptOrgMemberBanner({ enabled = true }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [state, setState] = useState(/** @type {any} */ (null));
  const [busy, setBusy] = useState(false);
  const [inactive, setInactive] = useState(false);
  const notifiedRef = useRef(false);

  const { remainingSeconds: tickLeft, expired: tickExpired } = useServerSyncedCountdown(
    state?.locked ? null : state?.timer || null,
  );

  const poll = useCallback(async () => {
    const res = await fetch("/api/attempt-context", { credentials: "include", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.attempt) {
      setInactive(true);
      setState(null);
      return;
    }
    setState(data);
    if (data.autoExpired && !notifiedRef.current) {
      notifiedRef.current = true;
      showToast({ message: "Time is up. The project was submitted.", severity: "success" });
    }
  }, [showToast]);

  const active = enabled && !inactive;
  const locked = Boolean(state?.locked);

  useEffect(() => {
    if (!enabled) return undefined;
    void poll();
    return undefined;
  }, [enabled, poll]);

  useEffect(() => {
    if (!active || !state || locked) return undefined;
    const id = window.setInterval(() => void poll(), MEMBER_POLL_MS);
    return () => window.clearInterval(id);
  }, [active, state, locked, poll]);

  const timer = state?.timer || null;
  const remaining = tickLeft ?? timer?.remainingSeconds;
  const hasTimer = Boolean(timer && timer.mode !== "NONE" && remaining != null);
  const timeUp = Boolean(active && !locked && hasTimer && (tickExpired || timer?.expired || remaining === 0));

  useEffect(() => {
    if (!timeUp) return undefined;
    void poll();
    const id = window.setInterval(() => void poll(), EXPIRY_RETRY_MS);
    return () => window.clearInterval(id);
  }, [timeUp, poll]);

  async function submitForStudent() {
    if (!(await confirm(MEMBER_SUBMIT_CONFIRM))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/attempt-context", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not submit.",
          severity: "error",
        });
        return;
      }
      setState(data);
      showToast({ message: "Project submitted.", severity: "success" });
    } finally {
      setBusy(false);
    }
  }

  if (!active || !state?.attempt) return null;

  const isAssessment = state.attempt.purpose === "ASSESSMENT";
  const title = state.attempt.projectName || state.attempt.organisationName || "Project";

  return (
    <>
      <AttemptBar
        isAssessment={isAssessment}
        title={title}
        timer={timer}
        remaining={remaining}
        timeUp={timeUp}
        locked={locked}
      >
        {!locked ? (
          <Button
            variant="contained"
            color="success"
            size="small"
            disabled={busy || timeUp}
            className="cursor-pointer disabled:cursor-not-allowed"
            onClick={() => void submitForStudent()}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <TaskAltRounded />}
            title="Submit this project for the student"
            aria-label="Submit project"
          >
            Submit
          </Button>
        ) : null}
      </AttemptBar>
      <TimeUpDialog open={timeUp} />
    </>
  );
}
