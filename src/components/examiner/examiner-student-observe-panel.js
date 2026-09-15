"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { format, parseISO } from "date-fns";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
  BRAND_PAGE_LEAD_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { BRAND_CARD_CLASS, BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { ExaminerObservationWorkDossier } from "@/components/examiner/examiner-observation-work-dossier";
import { useToast } from "@/components/providers/toast-provider";
import { formatDurationClock, formatDurationHuman } from "@/lib/academic/attempt-timer-format";

/**
 * Read-only “open this student’s organisation” view for Examiners.
 * Pass academicProjectId to load that project's isolated organisation report.
 * @param {{
 *   studentId: string;
 *   academicProjectId?: string;
 *   backHref?: string;
 *   backLabel?: string;
 *   initialTab?: string;
 * }} props
 */
export function ExaminerStudentObservePanel({
  studentId,
  academicProjectId,
  backHref = "/academic/participation",
  backLabel = "Back to participation",
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(/** @type {any} */ (null));
  const [yearId, setYearId] = useState("");
  const [focusStage, setFocusStage] = useState("");

  const load = useCallback(
    async ({ silent } = {}) => {
      if (!silent) setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (yearId) qs.set("academicYearId", yearId);
        const url = academicProjectId
          ? `/api/projects/${encodeURIComponent(academicProjectId)}/participants/${encodeURIComponent(studentId)}?${qs}`
          : `/api/examiner/observation/students/${encodeURIComponent(studentId)}?${qs}`;
        const res = await fetch(url, { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!silent) {
            showToast({
              message: typeof json.error === "string" ? json.error : "Could not load observation.",
              severity: "error",
            });
            setData(null);
          }
          return;
        }
        setData(json);
        if (!yearId && json?.academic?.selectedYearId) {
          setYearId(json.academic.selectedYearId);
        }
        const current = json?.progress?.summary?.currentStageKey;
        if (current && !silent) setFocusStage(current);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [studentId, academicProjectId, yearId, showToast],
  );

  useEffect(() => {
    void load();
    if (!academicProjectId) return undefined;
    const timer = setInterval(() => void load({ silent: true }), 15000);
    return () => clearInterval(timer);
  }, [load, academicProjectId]);

  if (loading && !data) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
        <CircularProgress sx={adminLoadingSpinnerSx} />
        <Typography sx={{ mt: 2 }}>Opening organisation…</Typography>
      </Box>
    );
  }

  if (!data) {
    return (
      <div className={BRAND_PAGE_SHELL_CLASS}>
        <DashboardPageIntro title="Observation unavailable" description="This student could not be loaded.">
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

  const s = data.student;
  const academic = data.academic;
  const org = data.organisation;
  const progress = data.progress;
  const demo = data.demo;
  const stages = progress?.stages || [];
  const current = stages.find((st) => st.state === "current") || null;
  const remaining = stages.filter((st) => st.state === "todo" || st.state === "current");
  const focused = stages.find((st) => st.key === focusStage) || current || stages[0] || null;

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title={org?.name || `${s.displayName} Organization`}
        description={
          academicProjectId
            ? `Read-only report of ${s.displayName}’s organisation for this project. You cannot change their work.`
            : `Read-only view of ${s.displayName}’s organisation. You can see every procurement stage, who acted, and what is still open. You cannot change their work.`
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip size="small" color="info" label={academicProjectId ? "Project report" : "Observing"} />
          <Chip size="small" label="Read-only" />
          {data.status?.label ? (
            <Chip size="small" color="primary" label={data.status.label} />
          ) : null}
          {data.currentStageLabel ? (
            <Chip size="small" color="info" label={`Stage: ${data.currentStageLabel}`} />
          ) : null}
          {data.marks?.finalScore != null && data.marks?.totalMarks != null ? (
            <Chip
              size="small"
              color={data.marks.finalPercent >= 50 ? "success" : "warning"}
              label={`${data.marks.finalScore}/${data.marks.totalMarks}${data.marks.live ? " live" : ""}`}
            />
          ) : data.marks?.finalPercent != null ? (
            <Chip
              size="small"
              color="success"
              label={`${data.marks.finalPercent}%`}
            />
          ) : null}
          {data.timer?.mode && data.timer.mode !== "NONE" ? (
            <Chip
              size="small"
              color={data.timer.expired ? "error" : "warning"}
              label={
                data.timer.expired
                  ? "Time up"
                  : data.timer.remainingSeconds != null
                    ? `${formatDurationClock(data.timer.remainingSeconds)} left`
                    : data.timer.label
              }
            />
          ) : null}
          {org?.projectCode ? <Chip size="small" label={org.projectCode} /> : null}
          {demo?.badge ? (
            <Chip size="small" color="warning" label={demo.badge.label} />
          ) : (
            <Chip size="small" color="success" label="Student" />
          )}
          {progress?.summary?.currentStageLabel ? (
            <Chip
              size="small"
              color="primary"
              label={`Now: ${progress.summary.currentStageLabel}`}
            />
          ) : null}
        </div>
        <p className={`mt-3 text-sm ${BRAND_PAGE_LEAD_CLASS}`}>
          {s.displayName} · {s.email}
          {s.studentNumber ? ` · ${s.studentNumber}` : ""}
          {s.programmeName ? ` · ${s.programmeName}` : ""}
          {s.campusLabel ? ` · ${s.campusLabel}` : ""}
          {" · "}
          {academic?.enrollment?.academicYear?.label || academic?.currentUniversityYear?.label || "—"}
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <TextField
            select
            size="small"
            label="Academic year"
            value={yearId || academic?.selectedYearId || ""}
            onChange={(e) => setYearId(e.target.value)}
            sx={{ ...themedTextFieldSx, minWidth: 180 }}
          >
            {(academic?.availableYears || []).map((y) => (
              <MenuItem key={y.id} value={y.id}>
                {y.label}
                {y.isCurrent ? " (current)" : ""}
              </MenuItem>
            ))}
          </TextField>
          <Button
            type="button"
            variant="outlined"
            onClick={() => void load()}
            disabled={loading}
            className="cursor-pointer disabled:cursor-not-allowed"
            startIcon={
              loading ? <CircularProgress size={14} color="inherit" /> : <RefreshRounded />
            }
          >
            Refresh
          </Button>
          <Button
            component={Link}
            href={backHref}
            startIcon={<ArrowBackRounded />}
            className="cursor-pointer"
          >
            {academicProjectId ? "Participants" : "Participation"}
          </Button>
        </div>
      </DashboardPageIntro>

      {!org ? (
        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
          <p className={BRAND_PAGE_LEAD_CLASS}>
            This participant has no organisation workspace yet. Progress appears after they start
            this project.
          </p>
        </section>
      ) : (
        <>
          {data.timer ? (
            <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
              <h2 className={BRAND_SECTION_TITLE_CLASS}>Time details</h2>
              <p className={`mt-1 ${BRAND_PAGE_LEAD_CLASS}`}>
                {data.timer.label}. Timed attempts use wall-clock time and do not pause if the
                student logs out.
              </p>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-zinc-500">Mode</dt>
                  <dd className="font-medium">{data.timer.mode}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Time used</dt>
                  <dd className="font-medium">{formatDurationHuman(data.timer.elapsedSeconds)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Time remaining</dt>
                  <dd className="font-medium">
                    {data.timer.remainingSeconds == null
                      ? "—"
                      : formatDurationHuman(data.timer.remainingSeconds)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Limit</dt>
                  <dd className="font-medium">
                    {data.timer.limitSeconds == null
                      ? data.timer.durationSeconds
                        ? formatDurationHuman(data.timer.durationSeconds)
                        : "—"
                      : formatDurationHuman(data.timer.limitSeconds)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Started</dt>
                  <dd className="font-medium">{fmtDateTime(data.timer.startedAt || data.attempt?.startedAt)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Deadline</dt>
                  <dd className="font-medium">{fmtDateTime(data.timer.deadlineAt)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Project closes</dt>
                  <dd className="font-medium">{fmtDateTime(data.timer.closeAt)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Submitted</dt>
                  <dd className="font-medium">{fmtDateTime(data.timer.submittedAt || data.attempt?.submittedAt)}</dd>
                </div>
              </dl>
            </section>
          ) : null}
          {Array.isArray(data.processScores) && data.processScores.length ? (
            <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
              <h2 className={BRAND_SECTION_TITLE_CLASS}>Process scores</h2>
              <p className={`mt-1 ${BRAND_PAGE_LEAD_CLASS}`}>
                Live automatic marks from completed processes on this project.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {data.processScores.map((proc) => (
                  <li key={proc.processCode}>
                    <Chip
                      size="small"
                      color={proc.satisfied ? "success" : "warning"}
                      label={`${proc.label}: ${proc.awarded}/${proc.marks}`}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
            <h2 className={BRAND_SECTION_TITLE_CLASS}>Procurement path</h2>
            <p className={`mt-1 ${BRAND_PAGE_LEAD_CLASS}`}>
              {progress?.summary?.completedCount ?? 0}/{progress?.summary?.totalCount ?? 0} stages
              complete ({progress?.summary?.percent ?? 0}%). Click a stage to inspect it.
            </p>
            <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {stages.map((stage) => (
                <li key={stage.key}>
                  <button
                    type="button"
                    title={stage.label}
                    onClick={() => setFocusStage(stage.key)}
                    className={`flex w-full cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                      focusStage === stage.key
                        ? "border-primary bg-[color:var(--nav-active-bg)]"
                        : "border-[color:var(--border-subtle)] hover:bg-[color:var(--nav-active-bg)]"
                    }`}
                  >
                    <span
                      className={`font-mono font-bold ${
                        stage.state === "done"
                          ? "text-green-700 dark:text-green-400"
                          : stage.state === "current"
                            ? "text-primary"
                            : "text-zinc-400"
                      }`}
                      aria-hidden
                    >
                      {stage.marker}
                    </span>
                    <span>
                      <span className="block font-semibold text-foreground">{stage.label}</span>
                      <span className="block text-xs text-zinc-500">
                        {stage.state === "done"
                          ? "Completed"
                          : stage.state === "current"
                            ? "Current"
                            : "Remaining"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          {current || data.liveTasks?.length ? (
            <section className={`${BRAND_CARD_CLASS} border-t-[3px] border-t-primary p-4 sm:p-5`}>
              <h2 className={BRAND_SECTION_TITLE_CLASS}>What they are doing now</h2>
              <p className={`mt-2 text-foreground`}>
                <span className="font-semibold">{current?.label || "Not started"}</span>
                {current?.status ? ` · ${current.status}` : ""}
              </p>
              {current?.currentAction ? (
                <p className={`mt-1 ${BRAND_PAGE_LEAD_CLASS}`}>Now: {current.currentAction}</p>
              ) : null}
              {current?.responsibleActor ? (
                <p className={`mt-1 ${BRAND_PAGE_LEAD_CLASS}`}>
                  Player: {current.responsibleActor}
                </p>
              ) : null}
              {data.liveTasks?.length ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {data.liveTasks.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-md border border-[color:var(--border-subtle)] px-3 py-2"
                    >
                      <span className="font-medium text-foreground">{t.title}</span>
                      <span className="block text-zinc-600 dark:text-zinc-400">
                        {[t.assignee, t.role].filter(Boolean).join(" · ") || "Unassigned"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>No open workflow task right now.</p>
              )}
            </section>
          ) : null}

          {focused ? (
            <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
              <h2 className={BRAND_SECTION_TITLE_CLASS}>
                Stage: {focused.label}{" "}
                <span className="font-normal text-zinc-500">
                  ({focused.state === "done"
                    ? "completed"
                    : focused.state === "current"
                      ? "current"
                      : "remaining"})
                </span>
              </h2>
              <dl className={`mt-3 grid gap-3 text-sm sm:grid-cols-2 ${BRAND_PAGE_LEAD_CLASS}`}>
                <div>
                  <dt className="font-medium text-foreground">Status</dt>
                  <dd>{focused.status || "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Player</dt>
                  <dd>{focused.responsibleActor || "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">When</dt>
                  <dd>{fmtDate(focused.occurredAt)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Related record</dt>
                  <dd>
                    {focused.relatedRecord
                      ? `${focused.relatedRecord.label} (${focused.relatedRecord.type})`
                      : "—"}
                  </dd>
                </div>
              </dl>
              <ul className="mt-3 list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">
                {focused.completedAction ? <li>Done: {focused.completedAction}</li> : null}
                {focused.currentAction ? <li>Now: {focused.currentAction}</li> : null}
                {focused.nextAction ? <li>Next: {focused.nextAction}</li> : null}
              </ul>
            </section>
          ) : null}

          <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
            <h2 className={BRAND_SECTION_TITLE_CLASS}>Remaining stages</h2>
            {!remaining.length ? (
              <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>All teaching stages are complete.</p>
            ) : (
              <ol className="mt-3 space-y-2 text-sm">
                {remaining.map((st) => (
                  <li key={st.key} className="flex gap-2">
                    <span className="text-primary">{st.marker}</span>
                    <span>
                      <span className="font-medium text-foreground">{st.label}</span>
                      {st.nextAction ? (
                        <span className="block text-zinc-600 dark:text-zinc-400">{st.nextAction}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
            <h2 className={BRAND_SECTION_TITLE_CLASS}>Players in this organisation</h2>
            <p className={`mt-1 ${BRAND_PAGE_LEAD_CLASS}`}>
              Simulated organisation users the student created (roles such as Procurement Officer).
            </p>
            {!data.players?.length ? (
              <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>No organisation users yet.</p>
            ) : (
              <TableContainer component={Paper} sx={{ ...adminOutlinedTableContainerSx, mt: 2 }}>
                <Table size="small" sx={adminTableSx}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Player</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell>Department</TableCell>
                      <TableCell>Last login</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.players.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          {p.displayName}
                          {p.isProjectAdmin ? (
                            <Chip size="small" className="ml-2" label="Org admin" />
                          ) : null}
                        </TableCell>
                        <TableCell>{p.roleName || "—"}</TableCell>
                        <TableCell>{p.departmentName || "—"}</TableCell>
                        <TableCell>{p.lastLoginAt ? fmtDate(p.lastLoginAt) : "Never"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </section>

          <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
            <h2 className={BRAND_SECTION_TITLE_CLASS}>Actions performed</h2>
            <p className={`mt-1 ${BRAND_PAGE_LEAD_CLASS}`}>
              Workflow decisions recorded in this organisation (approve, return, select method, …).
            </p>
            {!data.actions?.length ? (
              <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>No workflow actions yet.</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {data.actions.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-lg border border-[color:var(--border-subtle)] px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-foreground">
                      {humanDecision(a.decision)}
                      {a.processName ? ` · ${a.processName}` : ""}
                    </p>
                    <p className="text-zinc-600 dark:text-zinc-400">
                      {fmtDateTime(a.createdAt)}
                      {a.actorName ? ` · ${a.actorName}` : ""}
                      {a.actorRole ? ` (${a.actorRole})` : ""}
                    </p>
                    {a.taskTitle ? (
                      <p className="text-zinc-600 dark:text-zinc-400">Task: {a.taskTitle}</p>
                    ) : null}
                    {a.comment ? <p className="mt-1">{a.comment}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <ExaminerObservationWorkDossier work={data.work} />
        </>
      )}
    </div>
  );
}

/** @param {unknown} value */
function fmtDate(value) {
  if (!value) return "—";
  try {
    const d = typeof value === "string" ? parseISO(value) : new Date(/** @type {any} */ (value));
    if (Number.isNaN(d.getTime())) return "—";
    return format(d, "MMM d, yyyy");
  } catch {
    return "—";
  }
}

/** @param {unknown} value */
function fmtDateTime(value) {
  if (!value) return "—";
  try {
    const d = typeof value === "string" ? parseISO(value) : new Date(/** @type {any} */ (value));
    if (Number.isNaN(d.getTime())) return "—";
    return format(d, "MMM d, yyyy HH:mm");
  } catch {
    return "—";
  }
}

/** @param {string} decision */
function humanDecision(decision) {
  return String(decision || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}
