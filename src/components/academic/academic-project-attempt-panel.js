"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
  BRAND_PAGE_LEAD_CLASS,
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
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { RichHtml } from "@/components/ui/rich-html";
import { formatCountdownParts } from "@/lib/academic/attempt-timer-format";
import { useServerSyncedCountdown } from "@/hooks/use-server-synced-countdown";

/**
 * Student attempt workspace for one Academic Project.
 * Starting an attempt opens an isolated organisation shell with the examiner's organisation name.
 *
 * @param {{ projectId: string; purpose: 'PRACTICE' | 'ASSESSMENT' }} props
 */
export function AcademicProjectAttemptPanel({ projectId, purpose }) {
  const router = useRouter();
  const { refresh } = useAuthSession();
  const { showToast } = useToast();
  const backHref = purpose === "ASSESSMENT" ? "/academic/assessments" : "/academic/practice";
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [projectRow, setProjectRow] = useState(/** @type {any} */ (null));
  const [attempt, setAttempt] = useState(/** @type {any} */ (null));
  const [timer, setTimer] = useState(/** @type {any} */ (null));
  const [progress, setProgress] = useState(/** @type {any} */ (null));
  const [keyOpen, setKeyOpen] = useState(false);
  const [enrollmentKey, setEnrollmentKey] = useState("");
  const [submitOpen, setSubmitOpen] = useState(false);

  const { remainingSeconds: tickLeft, expired: tickExpired } = useServerSyncedCountdown(timer);

  const loadCatalogRow = useCallback(async () => {
    const res = await fetch(
      `/api/academic/projects?purpose=${encodeURIComponent(purpose)}`,
      { credentials: "include" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not load project.");
    const row = (data.projects || []).find((p) => p.id === projectId);
    if (!row) throw new Error("Project not available.");
    setProjectRow(row);
    setAttempt(row.latestAttempt || null);
    setTimer(row.timer || null);
    return row;
  }, [projectId, purpose]);

  const pollTimer = useCallback(async (attemptId) => {
    if (!attemptId) return;
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/attempts/${encodeURIComponent(attemptId)}/timer`,
      { credentials: "include" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setAttempt(data.attempt || null);
    setTimer(data.timer || null);
    setProgress(data.progress || null);
    if (data.autoExpired) {
      showToast({
        message: "Time expired. Your attempt was submitted automatically.",
        severity: "success",
      });
    }
  }, [projectId, showToast]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await loadCatalogRow();
        if (!cancelled && row?.latestAttempt?.id) {
          await pollTimer(row.latestAttempt.id);
        }
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
  }, [loadCatalogRow, pollTimer, showToast]);

  useEffect(() => {
    if (!attempt?.id || attempt.status !== "IN_PROGRESS") return undefined;
    const id = window.setInterval(() => {
      void pollTimer(attempt.id);
    }, 15000);
    return () => window.clearInterval(id);
  }, [attempt?.id, attempt?.status, pollTimer]);

  async function startAttempt(withKey) {
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
      setAttempt(data.attempt || null);
      setTimer(data.timer || null);
      await refresh();
      showToast({
        message: data.resumed
          ? "Continuing in this project's organisation."
          : "Attempt started. You are now in this project's organisation.",
        severity: "success",
      });
      await loadCatalogRow();
      if (data.attempt?.id) await pollTimer(data.attempt.id);
      router.push("/organisation");
    } finally {
      setBusy(false);
    }
  }

  async function continueInOrg() {
    setBusy(true);
    try {
      const res = await fetch("/api/student/active-org", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enter", academicProjectId: projectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await refresh();
        showToast({
          message: "Returned to this project's organisation.",
          severity: "success",
        });
        router.push(data.redirectTo || "/organisation");
        return;
      }
      // Workspace missing — start/resume creates it
      const startRes = await fetch(`/api/projects/${encodeURIComponent(projectId)}/attempts/start`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const startData = await startRes.json().catch(() => ({}));
      if (!startRes.ok) {
        showToast({
          message:
            typeof data.error === "string"
              ? data.error
              : typeof startData.error === "string"
                ? startData.error
                : "Could not open this organisation.",
          severity: "error",
        });
        return;
      }
      await refresh();
      showToast({
        message: "Continuing in this project's organisation.",
        severity: "success",
      });
      router.push("/organisation");
    } finally {
      setBusy(false);
    }
  }

  async function submitAttempt() {
    if (!attempt?.id) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/attempts/${encodeURIComponent(attempt.id)}/submit`,
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
      setAttempt(data.attempt || null);
      setTimer(data.timer || null);
      showToast({ message: "Attempt submitted.", severity: "success" });
      await loadCatalogRow();
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
        <DashboardPageIntro title="Project unavailable" description="This project is not available.">
          <Button component={Link} href={backHref} className="mt-3 cursor-pointer">
            Back
          </Button>
        </DashboardPageIntro>
      </div>
    );
  }

  const displayRemaining =
    tickLeft != null ? tickLeft : timer?.remainingSeconds;
  const timeUp = Boolean(tickExpired || timer?.expired || displayRemaining === 0);
  const remainingLabel =
    timer?.mode === "NONE" || displayRemaining == null
      ? "No time limit"
      : timeUp
        ? "Time up"
        : formatCountdownParts(displayRemaining).label;

  const inProgress =
    attempt?.status === "IN_PROGRESS" || attempt?.status === "RETURNED";
  const showStart =
    !inProgress &&
    projectRow.status?.key !== "closed" &&
    (!attempt ||
      attempt.status === "NOT_STARTED" ||
      attempt.status === "SUBMITTED" ||
      attempt.status === "COMPLETED");
  const startLabel =
    attempt?.status === "SUBMITTED" || attempt?.status === "COMPLETED"
      ? "Start new attempt"
      : "Start attempt";

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title={projectRow.name}
        description={
          projectRow.description ||
          "Read the instructions and question below. Starting an attempt moves you into this project's organisation."
        }
      >
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip size="small" color="primary" label={projectRow.status?.label || "—"} />
          <Chip size="small" label={`Attempt ${attempt?.attemptNumber || "—"}`} />
          <Chip
            size="small"
            color={timeUp ? "error" : timer?.mode === "DURATION" ? "warning" : "default"}
            label={
              timer?.mode === "NONE" || displayRemaining == null
                ? remainingLabel
                : timeUp
                  ? "Time up"
                  : `Time left · ${remainingLabel}`
            }
            title={
              timer?.mode === "DURATION"
                ? "Server timer — does not pause on logout"
                : timer?.mode === "WINDOW"
                  ? "Time left until this project closes"
                  : "No timed limit"
            }
          />
          {timer?.mode === "DURATION" && attempt?.status === "IN_PROGRESS" ? (
            <Chip
              size="small"
              label={`Used ${formatSecondsUsed(timer.elapsedSeconds)}`}
              title="Wall-clock time since start"
            />
          ) : null}
        </div>
      </DashboardPageIntro>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
          <h2 className={BRAND_SECTION_TITLE_CLASS}>Your attempt</h2>
          <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
            Starting moves you out of your default organisation into this project&apos;s
            organisation ({projectRow.organizationName || projectRow.name}). You can only work in
            one project at a time.
            {purpose === "ASSESSMENT"
              ? " Exit is disabled for assessments until the window closes."
              : " You can exit a practice project back to My Organisation."}
          </p>
          <div className="mt-3 rounded-lg border border-brand-red/30 bg-white px-3 py-2 dark:bg-zinc-950">
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand-red">Time left</p>
            <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-brand-red">
              {timer?.mode === "NONE" || displayRemaining == null
                ? "No timed limit"
                : timeUp
                  ? "Time up"
                  : formatCountdownParts(displayRemaining).label}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {showStart ? (
              <Button
                type="button"
                variant="contained"
                disabled={busy || (projectRow.status?.key === "closed" && !projectRow.enrolled)}
                className={`${BRAND_BTN_PRIMARY_CLASS} cursor-pointer disabled:cursor-not-allowed`}
                onClick={() => {
                  if (projectRow.enrollmentKeyRequired && !projectRow.enrolled) {
                    setKeyOpen(true);
                  } else {
                    void startAttempt(false);
                  }
                }}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
              >
                {startLabel}
              </Button>
            ) : null}
            {inProgress ? (
              <>
                <Button
                  type="button"
                  variant="contained"
                  disabled={busy}
                  className={`${BRAND_BTN_PRIMARY_CLASS} cursor-pointer disabled:cursor-not-allowed`}
                  onClick={() => void continueInOrg()}
                  startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
                >
                  Continue in organisation
                </Button>
                <Button
                  type="button"
                  variant="contained"
                  color="success"
                  disabled={busy}
                  className="cursor-pointer disabled:cursor-not-allowed"
                  onClick={() => setSubmitOpen(true)}
                >
                  Submit attempt
                </Button>
              </>
            ) : null}
            <Button component={Link} href={backHref} className="cursor-pointer">
              Back to list
            </Button>
          </div>
        </section>

        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
          <h2 className={BRAND_SECTION_TITLE_CLASS}>Procurement progress</h2>
          {progress?.summary ? (
            <>
              <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
                Current stage:{" "}
                <span className="font-semibold text-foreground">
                  {progress.summary.currentStageLabel || "—"}
                </span>{" "}
                ({progress.summary.percent}%)
              </p>
              <ol className="mt-3 space-y-1 text-sm">
                {(progress.stages || []).slice(0, 10).map((s) => (
                  <li key={s.key}>
                    <span className="font-mono">{s.marker}</span> {s.label}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
              Start an attempt, then progress will reflect your organisation activity.
            </p>
          )}
        </section>
      </div>

      <div className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Instructions</h2>
        <RichHtml
          html={projectRow.instructions}
          empty="No special instructions were added. Complete the procurement work required for this project in its organisation."
        />
      </div>

      <div className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Question / task</h2>
        <RichHtml
          html={projectRow.questionText}
          empty="No question text was provided for this project."
        />
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
      </div>

      <Dialog open={keyOpen} onClose={() => !busy && setKeyOpen(false)} PaperProps={{ sx: adminDialogPaperSx }}>
        <DialogTitle>Enrollment key</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Enrollment key"
            value={enrollmentKey}
            onChange={(e) => setEnrollmentKey(e.target.value.toUpperCase())}
            sx={themedTextFieldSx}
            inputProps={{ maxLength: 5 }}
          />
        </DialogContent>
        <DialogActions>
          <Button className="cursor-pointer" onClick={() => setKeyOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="cursor-pointer disabled:cursor-not-allowed"
            variant="contained"
            disabled={busy || enrollmentKey.trim().length < 5}
            onClick={() => void startAttempt(true)}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={submitOpen}
        onClose={() => !busy && setSubmitOpen(false)}
        PaperProps={{ sx: adminDialogPaperSx }}
      >
        <DialogTitle>Submit this attempt?</DialogTitle>
        <DialogContent>
          <p className={BRAND_PAGE_LEAD_CLASS}>
            Submitting locks this attempt
            {projectRow.allowEditAfterSubmit
              ? " (your examiner allows edits after submit)."
              : ". Further edits need a new attempt if allowed."}
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
            Submit
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

/** @param {number} sec */
function formatSecondsUsed(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m ${r}s`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}
