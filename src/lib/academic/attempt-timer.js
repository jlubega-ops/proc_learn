/**
 * Server-authoritative attempt timer (no DB access; safe for proxy and route handlers).
 */
import { ProjectAttemptStatus } from "@prisma/client";

/**
 * Server-authoritative timer snapshot.
 * Duration does not pause when the student logs out — it is wall-clock from startedAt.
 *
 * @param {{ attempt: any; project: any; now?: Date }} p
 */
export function computeAttemptTimer({ attempt, project, now = new Date() }) {
  const nowMs = now.getTime();
  const durationSeconds =
    typeof project?.durationSeconds === "number" && project.durationSeconds > 0
      ? project.durationSeconds
      : null;
  const closeAt = project?.closeAt ? new Date(project.closeAt) : null;
  const openAt = project?.openAt ? new Date(project.openAt) : null;
  const closeAtMs =
    closeAt && !Number.isNaN(closeAt.getTime()) ? closeAt.getTime() : null;
  const openAtIso = openAt && !Number.isNaN(openAt.getTime()) ? openAt.toISOString() : null;
  const closeAtIso = closeAtMs != null ? new Date(closeAtMs).toISOString() : null;

  const startedAt = attempt?.startedAt ? new Date(attempt.startedAt) : null;
  const startedOk = startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : null;
  const submittedAt = attempt?.submittedAt ? new Date(attempt.submittedAt) : null;
  const submittedOk =
    submittedAt && !Number.isNaN(submittedAt.getTime()) ? submittedAt : null;

  const inFlight =
    attempt?.status === ProjectAttemptStatus.IN_PROGRESS ||
    attempt?.status === ProjectAttemptStatus.RETURNED;

  /** Elapsed wall time from start (does not pause). */
  let elapsedSeconds = 0;
  if (startedOk) {
    const endMs = submittedOk ? submittedOk.getTime() : nowMs;
    elapsedSeconds = Math.max(0, Math.floor((endMs - startedOk.getTime()) / 1000));
  } else if (typeof attempt?.durationSecondsUsed === "number") {
    elapsedSeconds = Math.max(0, attempt.durationSecondsUsed);
  }

  /** @type {'DURATION' | 'WINDOW' | 'NONE'} */
  let mode = "NONE";
  /** @type {Date | null} */
  let deadlineAt = null;

  if (durationSeconds != null && startedOk) {
    mode = "DURATION";
    deadlineAt = new Date(startedOk.getTime() + durationSeconds * 1000);
    if (closeAtMs != null && closeAtMs < deadlineAt.getTime()) {
      deadlineAt = new Date(closeAtMs);
    }
  } else if (durationSeconds != null && !startedOk) {
    mode = "DURATION";
    deadlineAt = null;
  } else if (closeAtMs != null) {
    mode = "WINDOW";
    deadlineAt = new Date(closeAtMs);
  }

  let remainingSeconds = null;
  let expired = false;

  if (submittedOk) {
    remainingSeconds = 0;
    expired = false;
  } else if (deadlineAt) {
    remainingSeconds = Math.max(0, Math.floor((deadlineAt.getTime() - nowMs) / 1000));
    expired = remainingSeconds === 0 && (inFlight || (!attempt && mode === "WINDOW"));
  } else if (mode === "DURATION" && durationSeconds != null) {
    remainingSeconds = durationSeconds;
    expired = false;
  }

  if (inFlight && closeAtMs != null && nowMs >= closeAtMs) {
    expired = true;
    remainingSeconds = 0;
    if (!deadlineAt) deadlineAt = new Date(closeAtMs);
  }

  const limitSeconds =
    mode === "DURATION" && durationSeconds != null
      ? durationSeconds
      : mode === "WINDOW" && closeAtMs != null && startedOk
        ? Math.max(0, Math.floor((closeAtMs - startedOk.getTime()) / 1000))
        : mode === "WINDOW" && closeAtMs != null
          ? Math.max(0, Math.floor((closeAtMs - nowMs) / 1000))
          : null;

  return {
    mode,
    durationSeconds,
    openAt: openAtIso,
    closeAt: closeAtIso,
    startedAt: startedOk ? startedOk.toISOString() : null,
    submittedAt: submittedOk ? submittedOk.toISOString() : null,
    elapsedSeconds,
    remainingSeconds,
    limitSeconds,
    expired: Boolean(expired),
    serverNow: now.toISOString(),
    deadlineAt: deadlineAt ? deadlineAt.toISOString() : null,
    pausesOnLogout: false,
    label:
      mode === "DURATION"
        ? "Timed attempt"
        : mode === "WINDOW"
          ? "Closes with project window"
          : "No time limit",
  };
}
