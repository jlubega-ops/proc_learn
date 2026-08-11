"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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

/**
 * Student attempt workspace for one Academic Project.
 * Procurement runs in My Organisation; timer is polled from the server.
 *
 * @param {{ projectId: string; purpose: 'PRACTICE' | 'ASSESSMENT' }} props
 */
export function AcademicProjectAttemptPanel({ projectId, purpose }) {
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

  // Poll server timer every 15s while in progress
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
      showToast({
        message: data.resumed ? "Attempt resumed." : "Attempt started. Continue in My Organisation.",
        severity: "success",
      });
      await loadCatalogRow();
      if (data.attempt?.id) await pollTimer(data.attempt.id);
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

  const remainingLabel =
    timer?.durationSeconds == null
      ? "No time limit"
      : timer.remainingSeconds === 0
        ? "Time up"
        : formatSeconds(timer.remainingSeconds);

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title={projectRow.name}
        description={
          projectRow.description ||
          "Complete the required procurement work in My Organisation, then submit this attempt."
        }
      >
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip size="small" color="primary" label={projectRow.status?.label || "—"} />
          <Chip size="small" label={`Attempt ${attempt?.attemptNumber || "—"}`} />
          <Chip
            size="small"
            color={timer?.expired ? "error" : "default"}
            label={remainingLabel}
            title="Server timer — refresh-safe"
          />
        </div>
      </DashboardPageIntro>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
          <h2 className={BRAND_SECTION_TITLE_CLASS}>Your attempt</h2>
          <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
            Procurement happens in <strong>My Organisation</strong> on your current academic slate.
            This project does not create a second organisation.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {!attempt || attempt.status === "SUBMITTED" || attempt.status === "COMPLETED" ? (
              <Button
                type="button"
                variant="contained"
                disabled={busy || projectRow.status?.key === "closed"}
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
                {attempt?.status === "SUBMITTED" ? "Start new attempt" : "Start attempt"}
              </Button>
            ) : null}
            {attempt?.status === "IN_PROGRESS" ? (
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
            ) : null}
            <Button component={Link} href="/organisation" className="cursor-pointer">
              Open My Organisation
            </Button>
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
function formatSeconds(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m ${r}s left`;
  if (m > 0) return `${m}m ${r}s left`;
  return `${r}s left`;
}
