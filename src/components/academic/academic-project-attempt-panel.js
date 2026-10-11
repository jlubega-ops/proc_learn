"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import LoginRounded from "@mui/icons-material/LoginRounded";
import { format, formatDistanceStrict, parseISO } from "date-fns";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import {
  BRAND_BTN_PRIMARY_CLASS,
  BRAND_CARD_CLASS,
  BRAND_SECTION_TITLE_CLASS,
} from "@/lib/brand-ui";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";
import { useConfirm } from "@/components/providers/confirm-provider";
import { startAttemptConfirmOptions } from "@/components/academic/active-org-context-banner";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { RichHtml } from "@/components/ui/rich-html";
import { formatDurationHms } from "@/lib/academic/attempt-timer-format";
import { formatMarks } from "@/lib/academic/assessment-sections";
import { ScoreSectionsList } from "@/components/academic/score-sections-list";

const FINISHED_STATUSES = new Set(["SUBMITTED", "COMPLETED", "UNDER_REVIEW"]);

/**
 * Student view of one Academic Project. Starting (or continuing) moves the student into the
 * project's own organisation; the countdown and Submit live in the organisation banner.
 *
 * @param {{ projectId: string; purpose: 'PRACTICE' | 'ASSESSMENT' }} props
 */
export function AcademicProjectAttemptPanel({ projectId, purpose }) {
  const router = useRouter();
  const { refresh } = useAuthSession();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const backHref = purpose === "ASSESSMENT" ? "/academic/assessments" : "/academic/practice";
  const backLabel = purpose === "ASSESSMENT" ? "Back to Assessments" : "Back to Practice";
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [projectRow, setProjectRow] = useState(/** @type {any} */ (null));
  const [keyOpen, setKeyOpen] = useState(false);
  const [enrollmentKey, setEnrollmentKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const [result, setResult] = useState(/** @type {any} */ (null));

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/academic/projects?purpose=${encodeURIComponent(purpose)}`,
      { credentials: "include", cache: "no-store" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not load project.");
    const row = (data.projects || []).find((p) => p.id === projectId) || null;
    setProjectRow(row);
    return row;
  }, [projectId, purpose]);

  const loadResult = useCallback(async () => {
    const res = await fetch(`/api/student/results?projectId=${encodeURIComponent(projectId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    setResult(res.ok && data.released && data.result ? { ...data.result, view: data.view } : null);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await Promise.all([load(), loadResult().catch(() => setResult(null))]);
      } catch (e) {
        if (!cancelled) {
          showToast({
            message: e instanceof Error ? e.message : "Could not load project.",
            severity: "error",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, loadResult, showToast]);

  async function enterOrganisation(message) {
    await refresh();
    showToast({ message, severity: "success" });
    router.push("/organisation");
  }

  async function startAttempt(withKey) {
    if (withKey && enrollmentKey.trim().length < 5) {
      setKeyError("Enter the 5-character key.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/attempts/start`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withKey ? { enrollmentAccessKey: enrollmentKey.trim().toUpperCase() } : {},
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not start attempt.",
          severity: "error",
        });
        return;
      }
      setKeyOpen(false);
      await enterOrganisation(data.resumed ? "Attempt resumed." : "Attempt started.");
    } finally {
      setBusy(false);
    }
  }

  async function continueAttempt() {
    setBusy(true);
    try {
      const res = await fetch("/api/student/active-org", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enter", academicProjectId: projectId }),
      });
      if (res.ok) {
        await enterOrganisation("Attempt resumed.");
        return;
      }
      // Workspace missing — start/resume recreates it.
      const startRes = await fetch(`/api/projects/${encodeURIComponent(projectId)}/attempts/start`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const startData = await startRes.json().catch(() => ({}));
      if (!startRes.ok) {
        showToast({
          message: typeof startData.error === "string" ? startData.error : "Could not open this project.",
          severity: "error",
        });
        return;
      }
      await enterOrganisation("Attempt resumed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
        <CircularProgress sx={adminLoadingSpinnerSx} />
        <p className="mt-2 text-sm">Loading project…</p>
      </Box>
    );
  }

  if (!projectRow) {
    return (
      <div className={BRAND_PAGE_SHELL_CLASS}>
        <DashboardPageIntro title="Project unavailable" description="Not available.">
          <Button
            component={Link}
            href={backHref}
            startIcon={<ArrowBackRounded />}
            className="mt-3 cursor-pointer"
          >
            {backLabel}
          </Button>
        </DashboardPageIntro>
      </div>
    );
  }

  const attempt = projectRow.latestAttempt || null;
  const serverNow = toDate(projectRow.timer?.serverNow) || new Date();
  const openAt = toDate(projectRow.openAt);
  const closeAt = toDate(projectRow.closeAt);
  const upcoming = Boolean(openAt && openAt > serverNow);
  const closed = Boolean(closeAt && closeAt <= serverNow);
  const windowOpen = Boolean(projectRow.canEnroll) && !upcoming && !closed;

  const inProgress = attempt?.status === "IN_PROGRESS" || attempt?.status === "RETURNED";
  const maxAttempts = Number(projectRow.maxAttempts) > 0 ? Number(projectRow.maxAttempts) : null;
  const used = Number(projectRow.attemptCount) || 0;
  const attemptsLeft = maxAttempts == null ? Infinity : Math.max(0, maxAttempts - used);
  const finished = Boolean(attempt && FINISHED_STATUSES.has(attempt.status));

  /** @type {string} */
  let blockedReason = "";
  if (!inProgress) {
    if (upcoming) blockedReason = "Not open yet";
    else if (closed || !windowOpen) blockedReason = "This project is closed";
    else if (attemptsLeft <= 0 && !projectRow.allowEditAfterSubmit) blockedReason = "No attempts left";
  }

  const startLabel = inProgress
    ? "Continue attempt"
    : finished && attemptsLeft <= 0 && projectRow.allowEditAfterSubmit
      ? "Reopen attempt"
      : finished
        ? "Start new attempt"
        : "Start attempt";

  const windowLabel =
    openAt && closeAt ? formatDistanceStrict(closeAt, openAt) : closeAt ? "Until close" : "No end date";
  const timeLeftLabel = upcoming
    ? `Opens in ${formatDistanceStrict(openAt, serverNow)}`
    : closed
      ? "Closed"
      : closeAt
        ? `${formatDistanceStrict(closeAt, serverNow)} left`
        : "No end date";

  async function onStartClick() {
    if (inProgress) {
      void continueAttempt();
      return;
    }
    if (!(await confirm(startAttemptConfirmOptions(purpose === "ASSESSMENT")))) return;
    if (projectRow.enrollmentKeyRequired && !projectRow.enrolled) {
      setKeyError("");
      setKeyOpen(true);
      return;
    }
    void startAttempt(false);
  }

  const startButton = (
    <Button
      type="button"
      variant="contained"
      disabled={busy || Boolean(blockedReason)}
      className={`${BRAND_BTN_PRIMARY_CLASS} w-full cursor-pointer disabled:cursor-not-allowed sm:w-auto`}
      onClick={() => void onStartClick()}
      startIcon={
        busy ? (
          <CircularProgress size={16} color="inherit" />
        ) : inProgress ? (
          <LoginRounded />
        ) : (
          <PlayArrowRounded />
        )
      }
      aria-label={startLabel}
    >
      {startLabel}
    </Button>
  );

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          component={Link}
          href={backHref}
          startIcon={<ArrowBackRounded />}
          className="cursor-pointer"
        >
          {backLabel}
        </Button>
      </div>

      <DashboardPageIntro
        hero
        title={projectRow.name}
        description={projectRow.organizationName || undefined}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip
            size="small"
            variant="outlined"
            color="primary"
            label={purpose === "ASSESSMENT" ? "Assessment" : "Practice"}
          />
          <Chip
            size="small"
            color={statusChipColor(projectRow.status?.key)}
            label={projectRow.status?.label || "—"}
          />
          <Chip
            size="small"
            color={upcoming ? "warning" : closed ? "error" : "primary"}
            label={timeLeftLabel}
            title="Based on server time"
          />
        </div>
        {result ? <ResultSummary result={result} /> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Tooltip
            title={
              blockedReason ||
              (inProgress ? "Return to this project's organisation" : "Enter this project's organisation")
            }
          >
            <span className="inline-flex w-full sm:w-auto">{startButton}</span>
          </Tooltip>
        </div>
      </DashboardPageIntro>

      {result?.view === "DETAILS" ? (
        <>
          {result.feedback ? (
            <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
              <h2 className={BRAND_SECTION_TITLE_CLASS}>Feedback</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-foreground">{result.feedback}</p>
            </section>
          ) : null}
          <ScoreSectionsList sections={Array.isArray(result.sections) ? result.sections : []} />
        </>
      ) : null}

      <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`} aria-labelledby="project-schedule">
        <h2 id="project-schedule" className={BRAND_SECTION_TITLE_CLASS}>
          Schedule
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Opens on" value={openAt ? fmt(openAt) : "Now"} />
          <Fact label="Closes on" value={closeAt ? fmt(closeAt) : "No end date"} />
          <Fact label="Open for" value={windowLabel} />
          <Fact label="Time left" value={timeLeftLabel} />
          <Fact label="Time allowed" value={formatDurationHms(projectRow.durationSeconds)} mono />
          <Fact
            label="Attempts"
            value={maxAttempts == null ? `${used} used · No limit` : `${used} of ${maxAttempts} used`}
          />
        </dl>
      </section>

      {projectRow.description ? (
        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
          <h2 className={BRAND_SECTION_TITLE_CLASS}>Description</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-foreground">{projectRow.description}</p>
        </section>
      ) : null}

      <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Instructions</h2>
        <RichHtml html={projectRow.instructions} empty="No instructions." />
      </section>

      <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Question</h2>
        <RichHtml html={projectRow.questionText} empty="No question." />
        {projectRow.questionFileUrl ? (
          <p className="mt-3">
            <a
              href={projectRow.questionFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer font-medium text-primary underline-offset-2 hover:underline"
            >
              Open question file
            </a>
          </p>
        ) : null}
      </section>

      <Dialog open={keyOpen} onClose={() => !busy && setKeyOpen(false)} PaperProps={{ sx: adminDialogPaperSx }}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void startAttempt(true);
          }}
        >
          <DialogTitle>Enrollment key</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              margin="dense"
              label="Enrollment key"
              value={enrollmentKey}
              onChange={(e) => {
                setEnrollmentKey(e.target.value.toUpperCase());
                if (keyError) setKeyError("");
              }}
              error={Boolean(keyError)}
              helperText={keyError || " "}
              sx={themedTextFieldSx}
              inputProps={{ maxLength: 5 }}
            />
          </DialogContent>
          <DialogActions>
            <Button className="cursor-pointer" onClick={() => setKeyOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="cursor-pointer disabled:cursor-not-allowed"
              variant="contained"
              disabled={busy}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
            >
              Start
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </div>
  );
}

/**
 * Released score in the hero card.
 * @param {{ result: any }} props
 */
function ResultSummary({ result }) {
  const percent = Math.min(100, Math.max(0, Number(result.finalPercent) || 0));
  const pass = result.passFail === "PASS";
  const fail = result.passFail === "FAIL";
  return (
    <div
      className="mt-4 rounded-lg border border-[color:var(--border-subtle)] bg-surface-card p-3 sm:p-4"
      role="status"
      aria-label="Your result"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Your result{result.attemptNumber ? ` · Attempt #${result.attemptNumber}` : ""}
        </span>
        {pass || fail ? (
          <Chip size="small" color={pass ? "success" : "error"} label={pass ? "Pass" : "Fail"} />
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-3xl font-extrabold tabular-nums text-foreground">
          {formatMarks(Number(result.finalScore) || 0)}
          <span className="text-lg font-medium text-zinc-500"> / {formatMarks(Number(result.totalMarks) || 0)}</span>
        </span>
        <span className="text-lg font-bold tabular-nums text-primary">{result.finalPercent ?? 0}%</span>
      </div>
      <LinearProgress
        variant="determinate"
        value={percent}
        color={fail ? "error" : pass ? "success" : "primary"}
        sx={{ mt: 1, height: 8, borderRadius: 4 }}
        aria-label="Score"
      />
    </div>
  );
}

/** @param {{ label: string; value: string; mono?: boolean }} props */
function Fact({ label, value, mono = false }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className={`mt-0.5 font-medium text-foreground ${mono ? "tabular-nums" : ""}`}>{value}</dd>
    </div>
  );
}

/**
 * @param {string | undefined} key
 * @returns {'warning' | 'primary' | 'success' | 'error'}
 */
function statusChipColor(key) {
  if (key === "in_progress") return "primary";
  if (key === "submitted" || key === "completed") return "success";
  if (key === "closed") return "error";
  return "warning";
}

/** @param {unknown} v */
function toDate(v) {
  if (!v) return null;
  const d = typeof v === "string" ? parseISO(v) : new Date(/** @type {any} */ (v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** @param {Date} d */
function fmt(d) {
  return format(d, "MMM d, yyyy h:mm a");
}
