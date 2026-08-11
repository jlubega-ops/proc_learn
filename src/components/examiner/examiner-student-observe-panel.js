"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import { format, parseISO } from "date-fns";
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
  adminLoadingSpinnerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";

/**
 * @param {{ studentId: string; initialTab?: string }} props
 */
export function ExaminerStudentObservePanel({ studentId, initialTab = "overview" }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [tab, setTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(/** @type {any} */ (null));
  const [yearId, setYearId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (yearId) qs.set("academicYearId", yearId);
      const res = await fetch(
        `/api/examiner/observation/students/${encodeURIComponent(studentId)}?${qs}`,
        { credentials: "include" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof json.error === "string" ? json.error : "Could not load observation.",
          severity: "error",
        });
        setData(null);
        return;
      }
      setData(json);
      if (!yearId && json?.academic?.selectedYearId) {
        setYearId(json.academic.selectedYearId);
      }
    } finally {
      setLoading(false);
    }
  }, [studentId, yearId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
        <CircularProgress sx={adminLoadingSpinnerSx} />
        <Typography sx={{ mt: 2 }}>Loading student observation…</Typography>
      </Box>
    );
  }

  if (!data) {
    return (
      <div className={BRAND_PAGE_SHELL_CLASS}>
        <DashboardPageIntro title="Observation unavailable" description="This student could not be loaded.">
          <Button
            component={Link}
            href="/students/manage"
            startIcon={<ArrowBackRounded />}
            className="mt-3 cursor-pointer"
          >
            Back to Students
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

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title={s.displayName}
        description="Read-only observation of this student’s organisation and procurement progress. You cannot change their data here."
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip size="small" color="info" label="Observing" />
          <Chip size="small" label="Read-only" />
          {demo?.badge ? (
            <Chip
              size="small"
              color="warning"
              label={demo.badge.label}
              title="Demo participants are visible but excluded from official student statistics"
            />
          ) : (
            <Chip size="small" color="success" label="Student" />
          )}
          {demo && !demo.includeInOfficialStats ? (
            <Typography component="span" className="text-xs text-zinc-600 dark:text-zinc-400">
              Not included in official performance stats
            </Typography>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <TextField
            select
            size="small"
            label="Academic year"
            value={yearId || academic?.selectedYearId || ""}
            onChange={(e) => setYearId(e.target.value)}
            sx={{ ...themedTextFieldSx, minWidth: 180 }}
            helperText="Defaults to the current university year"
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
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : null}
          >
            Refresh
          </Button>
          <Button
            component={Link}
            href="/students/manage"
            startIcon={<ArrowBackRounded />}
            className="cursor-pointer"
          >
            Students
          </Button>
        </div>
      </DashboardPageIntro>

      <Tabs
        value={tab}
        onChange={(_e, v) => {
          setTab(v);
          router.replace(`/students/${studentId}/observe?tab=${v}`, { scroll: false });
        }}
        variant="scrollable"
        allowScrollButtonsMobile
        className="mb-3"
      >
        <Tab value="overview" label="Overview" className="cursor-pointer" />
        <Tab value="organisation" label="Organisation" className="cursor-pointer" />
        <Tab value="progress" label="Progress" className="cursor-pointer" />
        <Tab value="records" label="Records" className="cursor-pointer" />
      </Tabs>

      {tab === "overview" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
            <h2 className={BRAND_SECTION_TITLE_CLASS}>Student</h2>
            <dl className={`mt-3 space-y-2 text-sm ${BRAND_PAGE_LEAD_CLASS}`}>
              <div>
                <dt className="font-medium text-foreground">Email</dt>
                <dd>{s.email}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Student number</dt>
                <dd>{s.studentNumber || "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Programme</dt>
                <dd>{s.programmeName || s.programmeShortName || "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Year of study</dt>
                <dd>{s.yearOfStudy ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Account</dt>
                <dd>{s.accountStatus}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Last login</dt>
                <dd>{fmtDate(s.lastLoginAt)}</dd>
              </div>
            </dl>
          </section>

          <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
            <h2 className={BRAND_SECTION_TITLE_CLASS}>Academic context</h2>
            <dl className={`mt-3 space-y-2 text-sm ${BRAND_PAGE_LEAD_CLASS}`}>
              <div>
                <dt className="font-medium text-foreground">Academic year</dt>
                <dd>
                  {academic?.enrollment?.academicYear?.label ||
                    academic?.currentUniversityYear?.label ||
                    "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Semester</dt>
                <dd>
                  {academic?.semester?.name || "—"}
                  {academic?.semester?.isActive ? " (active)" : ""}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Enrollment</dt>
                <dd>
                  {academic?.enrollment
                    ? `${academic.enrollment.status} · ${humanParticipation(
                        academic.enrollment.participationType,
                      )}`
                    : "Not enrolled in this year"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Joined</dt>
                <dd>{fmtDate(academic?.enrollment?.joinedAt)}</dd>
              </div>
            </dl>
          </section>

          <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5 md:col-span-2`}>
            <h2 className={BRAND_SECTION_TITLE_CLASS}>Where have they reached?</h2>
            {progress?.summary ? (
              <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
                Current stage:{" "}
                <span className="font-semibold text-foreground">
                  {progress.summary.currentStageLabel || "Not started"}
                </span>
                {" · "}
                {progress.summary.completedCount}/{progress.summary.totalCount} stages complete (
                {progress.summary.percent}%)
                {progress.highlights?.openTask ? (
                  <>
                    {" · "}Open task: {progress.highlights.openTask.title}
                    {progress.highlights.openTask.role
                      ? ` (${progress.highlights.openTask.role})`
                      : ""}
                  </>
                ) : null}
              </p>
            ) : (
              <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
                No organisation yet — progress will appear once My Organisation exists.
              </p>
            )}
            <Button
              type="button"
              className={`${BRAND_BTN_PRIMARY_CLASS} mt-3 cursor-pointer`}
              onClick={() => setTab("progress")}
            >
              View progress
            </Button>
          </section>
        </div>
      ) : null}

      {tab === "organisation" ? (
        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
          <h2 className={BRAND_SECTION_TITLE_CLASS}>My Organisation</h2>
          {org ? (
            <dl className={`mt-3 space-y-2 text-sm ${BRAND_PAGE_LEAD_CLASS}`}>
              <div>
                <dt className="font-medium text-foreground">Name</dt>
                <dd>{org.name}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Unit code</dt>
                <dd>{org.projectCode || "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Status</dt>
                <dd>{org.status}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Counts</dt>
                <dd>
                  FY {progress?.counts?.financialYears ?? 0} · Budgets {progress?.counts?.budgets ?? 0} ·
                  Plans {progress?.counts?.plans ?? 0} · Requisitions{" "}
                  {progress?.counts?.requisitions ?? 0} · Procurements{" "}
                  {progress?.counts?.procurements ?? 0}
                </dd>
              </div>
            </dl>
          ) : (
            <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
              This participant has no personal organisation yet.
            </p>
          )}
          <p className={`mt-4 text-xs text-zinc-600 dark:text-zinc-400`}>
            Observation is read-only. Organisation setup and procurement actions remain with the
            student (or Student Mode demo).
          </p>
        </section>
      ) : null}

      {tab === "progress" ? (
        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
          <h2 className={BRAND_SECTION_TITLE_CLASS}>Procurement progress</h2>
          <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
            Derived from this organisation’s live financial year, budgets, plans, requisitions, and
            procurement cases — not a separate engine.
          </p>
          {!progress ? (
            <p className={`mt-4 ${BRAND_PAGE_LEAD_CLASS}`}>No progress data yet.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {progress.stages.map((stage) => (
                <li
                  key={stage.key}
                  className="rounded-lg border border-[color:var(--border-subtle)] px-3 py-3"
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <span
                      className={`font-mono text-base font-bold ${
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
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">
                        {stage.label}
                        <span className="ml-2 text-xs font-normal text-zinc-500">
                          {stage.state === "done"
                            ? "Completed"
                            : stage.state === "current"
                              ? "Current"
                              : "Remaining"}
                        </span>
                      </p>
                      <p className={`mt-1 text-sm ${BRAND_PAGE_LEAD_CLASS}`}>
                        Status: {stage.status || "—"}
                        {stage.responsibleActor ? ` · ${stage.responsibleActor}` : ""}
                        {stage.occurredAt ? ` · ${fmtDate(stage.occurredAt)}` : ""}
                      </p>
                      {stage.completedAction || stage.currentAction || stage.nextAction ? (
                        <ul className="mt-1 list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">
                          {stage.completedAction ? <li>Done: {stage.completedAction}</li> : null}
                          {stage.currentAction ? <li>Now: {stage.currentAction}</li> : null}
                          {stage.nextAction ? <li>Next: {stage.nextAction}</li> : null}
                        </ul>
                      ) : null}
                      {stage.relatedRecord ? (
                        <p className="mt-1 text-xs text-zinc-500">
                          Related: {stage.relatedRecord.label} ({stage.relatedRecord.type})
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {data.recentActivity?.length ? (
            <div className="mt-6">
              <h3 className={BRAND_SECTION_TITLE_CLASS}>Recent organisation activity</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {data.recentActivity.map((a) => (
                  <li key={a.id} className="text-zinc-600 dark:text-zinc-400">
                    <span className="text-foreground">{fmtDate(a.createdAt)}</span> —{" "}
                    {a.description}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "records" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <RecordList title="Budgets" rows={progress?.records?.budgets} empty="No budgets yet." />
          <RecordList title="Plans" rows={progress?.records?.plans} empty="No plans yet." />
          <RecordList
            title="Requisitions"
            rows={progress?.records?.requisitions}
            empty="No requisitions yet."
            labelKey="title"
            extra={(r) => r.requisitionReference}
          />
          <RecordList
            title="Procurements"
            rows={progress?.records?.procurements}
            empty="No procurements yet."
            labelKey="title"
            extra={(r) => r.procurementNumber}
          />
        </div>
      ) : null}
    </div>
  );
}

function RecordList({ title, rows, empty, labelKey = "title", extra }) {
  return (
    <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
      <h2 className={BRAND_SECTION_TITLE_CLASS}>{title}</h2>
      {!rows?.length ? (
        <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-md border border-[color:var(--border-subtle)] px-3 py-2"
            >
              <p className="font-medium text-foreground">
                {extra?.(r) ? `${extra(r)} · ` : ""}
                {r[labelKey] || r.title || "Record"}
              </p>
              <p className="text-zinc-600 dark:text-zinc-400">
                {r.status}
                {r.method ? ` · ${r.method}` : ""}
                {r.actor ? ` · ${r.actor}` : ""}
                {r.updatedAt ? ` · ${fmtDate(r.updatedAt)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
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

/** @param {string | null | undefined} p */
function humanParticipation(p) {
  if (p === "EXAMINER_DEMO") return "Examiner demo";
  if (p === "SYSTEM_ADMIN_DEMO") return "System admin demo";
  return "Student";
}
