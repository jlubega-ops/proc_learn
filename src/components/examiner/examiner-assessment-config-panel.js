"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import SaveRounded from "@mui/icons-material/SaveRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
  BRAND_PAGE_LEAD_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { BRAND_BTN_PRIMARY_CLASS, BRAND_CARD_CLASS, BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";
import {
  ASSESSMENT_PROCESS_CATALOGUE,
  processDisableBlockers,
  redistributeProcessMarks,
  requiredPrerequisiteCodes,
} from "@/lib/academic/assessment-process-catalogue";

const GROUP_LABEL = {
  CORE: "Core path",
  METHOD: "Procurement methods (a student normally completes one)",
  AWARD: "Award and contracting",
  PAY: "Invoice and payment",
};

/**
 * @param {{ projectId: string }} props
 */
export function ExaminerAssessmentConfigPanel({ projectId }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState(/** @type {any} */ (null));
  const [catalogue, setCatalogue] = useState(/** @type {any} */ (null));
  const [totalMarks, setTotalMarks] = useState("100");
  const [passMarkPercent, setPassMarkPercent] = useState("50");
  const [resultsReleased, setResultsReleased] = useState(false);
  const [scoringEnabled, setScoringEnabled] = useState(true);
  const [processes, setProcesses] = useState(
    /** @type {Array<{ processCode: string; isAllowed: boolean; marks: number; marksPinned: boolean }>} */ (
      []
    ),
  );
  /** @type {[Record<string, string>, Function]} */
  const [fieldErrors, setFieldErrors] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assessment`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof json.error === "string" ? json.error : "Could not load scoring.",
          severity: "error",
        });
        return;
      }
      setProject(json.project || null);
      setCatalogue(json.catalogue || null);
      const a = json.assessment;
      if (a) {
        setTotalMarks(String(a.totalMarks ?? 100));
        setPassMarkPercent(String(a.passMarkPercent ?? 50));
        setResultsReleased(Boolean(a.resultsReleased));
        setScoringEnabled(a.scoringEnabled !== false);
        setProcesses(
          (a.processes || []).map((p) => ({
            processCode: p.processCode,
            isAllowed: p.isAllowed !== false,
            marks: Number(p.marks) || 0,
            marksPinned: Boolean(p.marksPinned),
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const split = useMemo(() => {
    const total = Number(totalMarks);
    return redistributeProcessMarks(processes, Number.isFinite(total) ? total : 100);
  }, [processes, totalMarks]);

  const displayRows = split.rows;
  const allowedSum = displayRows.filter((p) => p.isAllowed).reduce((s, p) => s + (p.marks || 0), 0);

  function patchProcess(code, patch) {
    setProcesses((prev) => {
      const current =
        prev.length > 0
          ? prev
          : ASSESSMENT_PROCESS_CATALOGUE.map((m) => ({
              processCode: m.code,
              isAllowed: true,
              marks: 0,
              marksPinned: false,
            }));
      let next = current.map((row) =>
        row.processCode === code ? { ...row, ...patch } : { ...row },
      );
      if (patch.isAllowed === true) {
        const required = requiredPrerequisiteCodes(code);
        next = next.map((row) =>
          required.includes(row.processCode) ? { ...row, isAllowed: true } : row,
        );
      }
      const total = Number(totalMarks);
      return redistributeProcessMarks(next, Number.isFinite(total) ? total : 100).rows;
    });
  }

  async function save() {
    setSaving(true);
    setFieldErrors({});
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assessment`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalMarks: Number(totalMarks),
          passMarkPercent: Number(passMarkPercent),
          resultsReleased,
          scoringEnabled,
          processes: displayRows,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.errors) setFieldErrors(json.errors);
        showToast({
          message: typeof json.error === "string" ? json.error : "Please fix the highlighted fields.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Scoring saved.", severity: "success" });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleScoring(enable) {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assessment`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: enable ? "enable_scoring" : "disable_scoring",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof json.error === "string" ? json.error : "Could not update scoring.",
          severity: "error",
        });
        return;
      }
      setScoringEnabled(Boolean(json.assessment?.scoringEnabled));
      showToast({
        message: enable ? "Scoring enabled." : "Scoring disabled.",
        severity: "success",
      });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleRelease(release) {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assessment`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: release ? "release" : "unrelease" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof json.error === "string" ? json.error : "Could not update release.",
          severity: "error",
        });
        return;
      }
      setResultsReleased(Boolean(json.assessment?.resultsReleased));
      showToast({
        message: release ? "Results released to students." : "Results hidden from students.",
        severity: "success",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
        <CircularProgress sx={adminLoadingSpinnerSx} />
        <p className="mt-2 text-sm">Loading scoring…</p>
      </Box>
    );
  }

  const presets = catalogue?.passMarkPresets || [30, 40, 50, 60, 70];
  const groups = ["CORE", "METHOD", "AWARD", "PAY"];
  const isPractice = String(project?.purpose || "").toUpperCase() === "PRACTICE";
  const showSetup = !isPractice || scoringEnabled;

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title="Scoring"
        description={
          isPractice && !scoringEnabled
            ? `${project?.name || "This practice project"} has scoring turned off. Enable scoring to configure marks and processes.`
            : `${project?.name || "This project"} is marked automatically. Allowed processes share the total grade. Completing a process awards its marks.`
        }
      >
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip size="small" color="info" label={isPractice ? "Practice" : "Assessment"} />
          {scoringEnabled ? (
            <Chip size="small" color="success" label="Scoring on" />
          ) : (
            <Chip size="small" color="warning" label="Scoring off" />
          )}
          {showSetup ? (
            <>
              <Chip size="small" label={`Out of ${totalMarks || 100}`} />
              <Chip size="small" color="warning" label={`Pass at ${passMarkPercent}%`} />
            </>
          ) : null}
          {resultsReleased ? (
            <Chip size="small" color="success" label="Results released" />
          ) : (
            <Chip size="small" color="warning" label="Results hidden" />
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {isPractice ? (
            <Button
              type="button"
              variant={scoringEnabled ? "outlined" : "contained"}
              disabled={saving}
              className={`${scoringEnabled ? "" : BRAND_BTN_PRIMARY_CLASS} cursor-pointer disabled:cursor-not-allowed`}
              onClick={() => void toggleScoring(!scoringEnabled)}
            >
              {scoringEnabled ? "Disable scoring" : "Enable scoring"}
            </Button>
          ) : null}
          {showSetup ? (
            <>
              <Button
                type="button"
                variant="contained"
                disabled={saving}
                className={`${BRAND_BTN_PRIMARY_CLASS} cursor-pointer disabled:cursor-not-allowed`}
                onClick={() => void save()}
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveRounded />}
              >
                Save scoring
              </Button>
              <Button
                type="button"
                disabled={saving}
                className="cursor-pointer disabled:cursor-not-allowed"
                onClick={() => void toggleRelease(!resultsReleased)}
              >
                {resultsReleased ? "Hide results from students" : "Release results"}
              </Button>
            </>
          ) : null}
          <Button component={Link} href={`/projects/${projectId}/results`} className="cursor-pointer">
            Results
          </Button>
        </div>
      </DashboardPageIntro>

      {!showSetup ? (
        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
          <p className={BRAND_PAGE_LEAD_CLASS}>
            Practice projects do not score by default. Turn on scoring to set a grading scale and
            allowed processes for this project.
          </p>
        </section>
      ) : (
        <>
      <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Grading scale</h2>
        <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
          Default total is 100. Pass mark is a percentage of that total (50, 30, 70, and so on).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <TextField
            label="Total marks"
            value={totalMarks}
            onChange={(e) => {
              setTotalMarks(e.target.value);
            }}
            onBlur={() => {
              const n = Number(totalMarks);
              setProcesses((prev) =>
                redistributeProcessMarks(prev, Number.isFinite(n) ? n : 100).rows,
              );
            }}
            error={Boolean(fieldErrors.totalMarks || fieldErrors.marks)}
            helperText={fieldErrors.totalMarks || fieldErrors.marks || " "}
            fullWidth
            sx={themedTextFieldSx}
            inputProps={{ inputMode: "numeric" }}
          />
          <TextField
            label="Pass mark (%)"
            value={passMarkPercent}
            onChange={(e) => setPassMarkPercent(e.target.value)}
            error={Boolean(fieldErrors.passMarkPercent)}
            helperText={fieldErrors.passMarkPercent || " "}
            fullWidth
            sx={themedTextFieldSx}
            inputProps={{ inputMode: "numeric" }}
          />
        </div>
        <div className="mt-1 flex flex-wrap gap-2">
          {presets.map((n) => (
            <Chip
              key={n}
              label={`${n}%`}
              color={String(passMarkPercent) === String(n) ? "primary" : "default"}
              onClick={() => setPassMarkPercent(String(n))}
              className="cursor-pointer"
            />
          ))}
        </div>
      </section>

      <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Available processes</h2>
        <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
          These are the processes organisation admins can see and enable for this project. The
          default organisation is unchanged. You cannot turn off a process that a later allowed
          process still needs — for example Requisition needs Budgeting and Planning.
        </p>
        {fieldErrors.processes ? (
          <Alert severity="error" className="mt-3">
            {fieldErrors.processes}
          </Alert>
        ) : null}
        <div className="mt-4 space-y-5">
          {groups.map((group) => {
            const items = ASSESSMENT_PROCESS_CATALOGUE.filter((p) => p.group === group);
            return (
              <div key={group}>
                <h3 className="mb-2 text-sm font-semibold text-foreground">{GROUP_LABEL[group]}</h3>
                <ul className="space-y-2">
                  {items.map((meta) => {
                    const row = displayRows.find((p) => p.processCode === meta.code) || {
                      processCode: meta.code,
                      isAllowed: true,
                      marks: 0,
                      marksPinned: false,
                    };
                    const allowedCodes = displayRows
                      .filter((p) => p.isAllowed)
                      .map((p) => p.processCode);
                    const blockers = row.isAllowed
                      ? processDisableBlockers(meta.code, allowedCodes)
                      : [];
                    const lockedOff = blockers.length > 0;
                    const prereqNames = (meta.dependsOn || [])
                      .map((c) => ASSESSMENT_PROCESS_CATALOGUE.find((x) => x.code === c)?.name)
                      .filter(Boolean);
                    const anyNames = (meta.dependsOnAny || [])
                      .map((c) => ASSESSMENT_PROCESS_CATALOGUE.find((x) => x.code === c)?.name)
                      .filter(Boolean);
                    return (
                      <li
                        key={meta.code}
                        className="flex flex-col gap-1 rounded-lg border border-[color:var(--border-subtle)] p-3 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{meta.name}</span>
                            {lockedOff ? (
                              <Tooltip title={blockers.join(" ")}>
                                <LockRounded fontSize="small" color="warning" />
                              </Tooltip>
                            ) : null}
                          </div>
                          <p className={`mt-1 text-sm ${BRAND_PAGE_LEAD_CLASS}`}>{meta.summary}</p>
                          {prereqNames.length ? (
                            <p className="mt-1 text-xs text-zinc-500">
                              Needs: {prereqNames.join(" and ")}
                            </p>
                          ) : null}
                          {anyNames.length ? (
                            <p className="mt-1 text-xs text-zinc-500">
                              Needs one of: {anyNames.join(", ")}
                            </p>
                          ) : null}
                          {lockedOff ? (
                            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                              {blockers[0]}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm">{row.isAllowed ? "Allowed" : "Hidden"}</span>
                          <Switch
                            checked={row.isAllowed}
                            disabled={lockedOff && row.isAllowed}
                            onChange={(e) => {
                              if (!e.target.checked && lockedOff) return;
                              patchProcess(meta.code, {
                                isAllowed: e.target.checked,
                                marksPinned: e.target.checked ? row.marksPinned : false,
                              });
                            }}
                            inputProps={{ "aria-label": `Allow ${meta.name}` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Marks per process</h2>
        <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
          Allowed processes share {totalMarks || 100} marks. Set a mark on one process to pin it;
          the others share what remains. Total of allowed processes is {allowedSum} /{" "}
          {totalMarks || 100}.
        </p>
        {!split.ok && split.error ? (
          <Alert severity="error" className="mt-3">
            {split.error}
          </Alert>
        ) : null}
        <ul className="mt-4 space-y-2">
          {displayRows
            .filter((p) => p.isAllowed)
            .map((row) => {
              const meta = ASSESSMENT_PROCESS_CATALOGUE.find((p) => p.code === row.processCode);
              return (
                <li
                  key={row.processCode}
                  className="grid items-center gap-2 rounded-lg border border-[color:var(--border-subtle)] p-3 sm:grid-cols-[1fr_8rem_auto]"
                >
                  <div>
                    <div className="font-medium">{meta?.name || row.processCode}</div>
                    {row.marksPinned ? (
                      <span className="text-xs text-primary">Pinned — remaining marks share the rest</span>
                    ) : (
                      <span className="text-xs text-zinc-500">Auto share</span>
                    )}
                  </div>
                  <TextField
                    label="Marks"
                    size="small"
                    value={String(row.marks)}
                    onChange={(e) => {
                      const n = Math.max(0, Math.round(Number(e.target.value) || 0));
                      patchProcess(row.processCode, { marks: n, marksPinned: true });
                    }}
                    sx={themedTextFieldSx}
                    inputProps={{ inputMode: "numeric", "aria-label": `Marks for ${meta?.name}` }}
                  />
                  {row.marksPinned ? (
                    <Button
                      type="button"
                      size="small"
                      className="cursor-pointer"
                      onClick={() => patchProcess(row.processCode, { marksPinned: false })}
                    >
                      Share auto
                    </Button>
                  ) : (
                    <span />
                  )}
                </li>
              );
            })}
        </ul>
      </section>
        </>
      )}
    </div>
  );
}
