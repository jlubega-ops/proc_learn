"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import SaveRounded from "@mui/icons-material/SaveRounded";
import PushPinRounded from "@mui/icons-material/PushPinRounded";
import ToggleOnRounded from "@mui/icons-material/ToggleOnRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import UnfoldMoreRounded from "@mui/icons-material/UnfoldMoreRounded";
import UnfoldLessRounded from "@mui/icons-material/UnfoldLessRounded";
import RuleRounded from "@mui/icons-material/RuleRounded";
import { ProjectSectionBar } from "@/components/projects/project-section-bar";
import { BRAND_PAGE_SHELL_CLASS } from "@/components/layout/dashboard-page-intro";
import { BRAND_BTN_PRIMARY_CLASS, BRAND_CARD_CLASS, BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { actionConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { useDraftSync } from "@/hooks/use-draft-sync";
import { ROLE } from "@/lib/roles";
import {
  SCORING_GROUP_LABELS,
  buildScoringTree,
  formatMarks,
  scoringItemRowKey,
  scoringTreeToRows,
} from "@/lib/academic/assessment-sections";

/**
 * Marks input that keeps the typed text while focused (so "2." survives) and commits on change.
 * @param {{ value: number; disabled?: boolean; label: string; ariaLabel: string; error?: boolean; onCommit: (n: number) => void }} props
 */
function MarksField({ value, disabled, label, ariaLabel, error, onCommit }) {
  const [text, setText] = useState(/** @type {string | null} */ (null));
  return (
    <TextField
      label={label}
      value={disabled ? "—" : text ?? formatMarks(value)}
      disabled={disabled}
      error={error}
      onFocus={() => setText(formatMarks(value))}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9.]/g, "");
        setText(raw);
        const n = Number(raw);
        if (raw !== "" && Number.isFinite(n)) onCommit(Math.max(0, Math.round(n * 100) / 100));
      }}
      onBlur={() => setText(null)}
      fullWidth
      sx={themedTextFieldSx}
      inputProps={{ inputMode: "decimal", "aria-label": ariaLabel }}
    />
  );
}

/**
 * @param {{ pinned: boolean; name: string; onUnpin: () => void }} props
 */
function PinButton({ pinned, name, onUnpin }) {
  if (!pinned) return <span className="inline-block w-[34px]" aria-hidden />;
  return (
    <Tooltip title="Set by you. Click to share automatically.">
      <IconButton size="small" color="primary" aria-label={`Share marks for ${name} automatically`} onClick={onUnpin}>
        <PushPinRounded fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

/**
 * @param {{ projectId: string }} props
 */
export function ExaminerAssessmentConfigPanel({ projectId }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { session } = useAuthSession();
  const canTeach = session?.activeRole === ROLE.EXAMINER;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState(/** @type {any} */ (null));
  const [totalMarks, setTotalMarks] = useState("100");
  const [passMarkPercent, setPassMarkPercent] = useState("50");
  const [scoringEnabled, setScoringEnabled] = useState(true);
  /** Flat stored rows: section keys and "SECTION:ITEM" keys. */
  const [rows, setRows] = useState(
    /** @type {Array<{ processCode: string; isAllowed: boolean; marks: number; marksPinned: boolean }>} */ ([]),
  );
  const [expanded, setExpanded] = useState(/** @type {Record<string, boolean>} */ ({}));
  const [enabledProcessCodes, setEnabledProcessCodes] = useState(/** @type {string[]} */ ([]));
  const [programmeCodes, setProgrammeCodes] = useState(/** @type {string[] | null} */ (null));
  /** @type {[Record<string, string>, Function]} */
  const [fieldErrors, setFieldErrors] = useState({});
  const [loadedOnce, setLoadedOnce] = useState(false);

  const scoringDraft = useDraftSync(
    `assessment:config:${projectId}`,
    { totalMarks, passMarkPercent, rows },
    (d) => {
      if (typeof d.totalMarks === "string") setTotalMarks(d.totalMarks);
      if (typeof d.passMarkPercent === "string") setPassMarkPercent(d.passMarkPercent);
      if (Array.isArray(d.rows)) setRows(/** @type {any} */ (d.rows));
    },
    { enabled: canTeach && loadedOnce },
  );

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
      const a = json.assessment;
      if (a) {
        setTotalMarks(String(a.totalMarks ?? 100));
        setPassMarkPercent(String(a.passMarkPercent ?? 50));
        setScoringEnabled(a.scoringEnabled !== false);
        if (Array.isArray(a.sections)) setRows(scoringTreeToRows(a.sections));
        setEnabledProcessCodes(
          Array.isArray(a.effectiveProcessCodes)
            ? a.effectiveProcessCodes
            : Array.isArray(a.enabledProcessCodes)
              ? a.enabledProcessCodes
              : [],
        );
        setProgrammeCodes(Array.isArray(a.programmeProcessCodes) ? a.programmeProcessCodes : null);
      }
      setLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = Number(totalMarks);
  const tree = useMemo(
    () => buildScoringTree(rows, Number.isFinite(total) && total > 0 ? total : 100),
    [rows, total],
  );
  const availableCodes = new Set(enabledProcessCodes);
  const enabledSum =
    Math.round(tree.sections.filter((s) => s.isAllowed).reduce((s, x) => s + x.marks, 0) * 100) / 100;

  /**
   * @param {string} code
   * @param {Partial<{ isAllowed: boolean; marks: number; marksPinned: boolean }>} patch
   */
  function patchRow(code, patch) {
    setRows((prev) => {
      const base = scoringTreeToRows(buildScoringTree(prev, Number.isFinite(total) && total > 0 ? total : 100).sections);
      return base.map((r) => (r.processCode === code ? { ...r, ...patch } : r));
    });
  }

  async function save() {
    /** @type {Record<string, string>} */
    const errors = {};
    const pass = Number(passMarkPercent);
    if (!passMarkPercent.trim()) errors.passMarkPercent = "Enter a pass mark.";
    else if (!Number.isInteger(pass) || pass < 1 || pass > 100) errors.passMarkPercent = "Enter 1 to 100.";
    if (!totalMarks.trim()) errors.totalMarks = "Enter total marks.";
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
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
          scoringEnabled,
          sections: tree.sections,
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
      scoringDraft.clearDraft();
    } finally {
      setSaving(false);
    }
  }

  async function toggleScoring(enable) {
    const ok = await confirm(
      enable
        ? actionConfirmOptions("Enable scoring", { message: "Students' work on this practice will be marked." })
        : actionConfirmOptions("Disable scoring", {
            message: "This practice will no longer be marked.",
            color: "warning",
          }),
    );
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assessment`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: enable ? "enable_scoring" : "disable_scoring" }),
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
      showToast({ message: enable ? "Scoring enabled." : "Scoring disabled.", severity: "success" });
      await load();
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

  const isPractice = String(project?.purpose || "").toUpperCase() === "PRACTICE";
  const showSetup = !isPractice || scoringEnabled;
  const shownTotal = Number.isFinite(total) && total > 0 ? total : 100;
  const allOpen = tree.sections.every((s) => expanded[s.key]);
  const groupKeys = Object.keys(SCORING_GROUP_LABELS);
  const listError = fieldErrors.sections || fieldErrors.marks || tree.error;

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <ProjectSectionBar
        icon={RuleRounded}
        title="Scoring"
        stats={
          <>
            <Chip
              size="small"
              color={scoringEnabled ? "success" : "warning"}
              label={scoringEnabled ? "Scoring on" : "Scoring off"}
            />
            {!canTeach ? <Chip size="small" color="info" label="View only" /> : null}
          </>
        }
        actions={
          <>
            {showSetup ? (
              <>
                <TextField
                  label="Total marks"
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(e.target.value.replace(/[^0-9]/g, ""))}
                  error={Boolean(fieldErrors.totalMarks)}
                  helperText={fieldErrors.totalMarks || undefined}
                  disabled={!canTeach}
                  sx={{ ...themedTextFieldSx, width: { xs: "calc(50% - 4px)", sm: 120 } }}
                  inputProps={{ inputMode: "numeric", "aria-label": "Total marks" }}
                />
                <TextField
                  label="Pass mark (%)"
                  value={passMarkPercent}
                  onChange={(e) => setPassMarkPercent(e.target.value.replace(/[^0-9]/g, ""))}
                  error={Boolean(fieldErrors.passMarkPercent)}
                  helperText={fieldErrors.passMarkPercent || undefined}
                  disabled={!canTeach}
                  sx={{ ...themedTextFieldSx, width: { xs: "calc(50% - 4px)", sm: 120 } }}
                  inputProps={{ inputMode: "numeric", "aria-label": "Pass mark percent" }}
                />
              </>
            ) : null}
            {isPractice && canTeach ? (
              <Button
                type="button"
                variant={scoringEnabled ? "outlined" : "contained"}
                color={scoringEnabled ? "warning" : "primary"}
                disabled={saving}
                className={`${scoringEnabled ? "" : BRAND_BTN_PRIMARY_CLASS} cursor-pointer disabled:cursor-not-allowed`}
                onClick={() => void toggleScoring(!scoringEnabled)}
                startIcon={<ToggleOnRounded />}
              >
                {scoringEnabled ? "Disable" : "Enable scoring"}
              </Button>
            ) : null}
            {showSetup && canTeach ? (
              <Button
                type="button"
                variant="contained"
                disabled={saving}
                className={`${BRAND_BTN_PRIMARY_CLASS} cursor-pointer disabled:cursor-not-allowed`}
                onClick={() => void save()}
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveRounded />}
              >
                Save
              </Button>
            ) : null}
          </>
        }
      />

      {!showSetup ? (
        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`} role="status">
          <p className="text-sm text-foreground">Scoring is off.</p>
        </section>
      ) : (
        <>
          <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`} aria-labelledby="scoring-sections">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="scoring-sections" className={BRAND_SECTION_TITLE_CLASS}>
                Sections
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <Chip
                  size="small"
                  color={tree.ok && enabledSum === shownTotal ? "success" : "error"}
                  label={`${formatMarks(enabledSum)} / ${formatMarks(shownTotal)} marks`}
                />
                <Button
                  type="button"
                  size="small"
                  variant="outlined"
                  className="cursor-pointer"
                  startIcon={allOpen ? <UnfoldLessRounded /> : <UnfoldMoreRounded />}
                  onClick={() =>
                    setExpanded(allOpen ? {} : Object.fromEntries(tree.sections.map((s) => [s.key, true])))
                  }
                >
                  {allOpen ? "Collapse all" : "Expand all"}
                </Button>
              </div>
            </div>
            {listError ? (
              <Alert severity="error" className="mt-3">
                {listError}
              </Alert>
            ) : null}

            <div className="mt-4 space-y-5">
              {groupKeys.map((groupKey) => {
                const sections = tree.sections.filter((s) => s.group === groupKey);
                if (!sections.length) return null;
                return (
                  <div key={groupKey}>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">
                      {SCORING_GROUP_LABELS[groupKey]}
                    </h3>
                    <ul className="divide-y divide-[color:var(--border-subtle)] rounded-lg border border-[color:var(--border-subtle)]">
                      {sections.map((section) => {
                        const available = !section.processCode || availableCodes.has(section.key);
                        const programmeOff = Boolean(
                          section.processCode && programmeCodes && !programmeCodes.includes(section.key),
                        );
                        const unavailableHint = programmeOff
                          ? "Disabled for this programme and year"
                          : "Enable it on the Processes tab to score it";
                        const open = Boolean(expanded[section.key]);
                        const enabledItems = section.items.filter((i) => i.isAllowed).length;
                        const sectionError = fieldErrors[`section.${section.key}`] || section.error;
                        return (
                          <li key={section.key} className="p-3">
                            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-2 sm:grid-cols-[auto_1fr_7rem_auto]">
                              <Tooltip title={open ? "Hide items" : "Show items"}>
                                <IconButton
                                  size="small"
                                  aria-expanded={open}
                                  aria-label={`${open ? "Hide" : "Show"} items for ${section.name}`}
                                  onClick={() => setExpanded((p) => ({ ...p, [section.key]: !open }))}
                                >
                                  <ExpandMoreRounded
                                    fontSize="small"
                                    className={`transition-transform ${open ? "rotate-180" : ""}`}
                                  />
                                </IconButton>
                              </Tooltip>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-medium text-foreground">{section.name}</span>
                                  {available ? (
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      color={section.isAllowed ? "primary" : "warning"}
                                      label={
                                        section.isAllowed
                                          ? `${enabledItems}/${section.items.length} items`
                                          : "Not scored"
                                      }
                                    />
                                  ) : (
                                    <Tooltip title={unavailableHint}>
                                      <Chip
                                        size="small"
                                        color="error"
                                        variant="outlined"
                                        label={programmeOff ? "Off for programme" : "Not available"}
                                      />
                                    </Tooltip>
                                  )}
                                  {section.isAllowed && section.marks === 0 ? (
                                    <Chip size="small" color="warning" label="No marks" />
                                  ) : null}
                                </div>
                                {sectionError ? <p className="text-xs text-brand-red">{sectionError}</p> : null}
                              </div>
                              <div className="col-span-3 row-start-2 sm:col-span-1 sm:row-start-auto">
                                <MarksField
                                  label="Marks"
                                  value={section.marks}
                                  disabled={!section.isAllowed}
                                  error={Boolean(sectionError)}
                                  ariaLabel={`Marks for ${section.name}`}
                                  onCommit={(n) => patchRow(section.key, { marks: n, marksPinned: true })}
                                />
                              </div>
                              <div className="col-start-3 row-start-1 flex items-center justify-end sm:col-start-auto sm:row-start-auto">
                                <PinButton
                                  pinned={section.isAllowed && section.marksPinned}
                                  name={section.name}
                                  onUnpin={() => patchRow(section.key, { marksPinned: false })}
                                />
                                <Tooltip
                                  title={
                                    !available
                                      ? unavailableHint
                                      : section.isAllowed
                                        ? `Stop scoring ${section.name} (stays available to students)`
                                        : `Score ${section.name}`
                                  }
                                >
                                  <span>
                                    <Switch
                                      checked={section.isAllowed}
                                      disabled={!available || !canTeach}
                                      color="success"
                                      onChange={(e) =>
                                        patchRow(section.key, {
                                          isAllowed: e.target.checked,
                                          marksPinned: e.target.checked ? section.marksPinned : false,
                                        })
                                      }
                                      inputProps={{ "aria-label": `Score ${section.name}` }}
                                    />
                                  </span>
                                </Tooltip>
                              </div>
                            </div>

                            <Collapse in={open} unmountOnExit>
                              <ul className="mt-3 space-y-2 border-l-2 border-[color:var(--border-subtle)] pl-3 sm:ml-10">
                                {section.items.map((item) => {
                                  const code = scoringItemRowKey(section.key, item.key);
                                  const itemOn = section.isAllowed && item.isAllowed;
                                  return (
                                    <li
                                      key={item.key}
                                      className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 sm:grid-cols-[1fr_7rem_auto]"
                                    >
                                      <span
                                        className={`min-w-0 text-sm ${itemOn ? "text-foreground" : "text-zinc-500 dark:text-zinc-400"}`}
                                      >
                                        {item.label}
                                      </span>
                                      <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                                        <MarksField
                                          label="Marks"
                                          value={item.marks}
                                          disabled={!itemOn}
                                          ariaLabel={`Marks for ${item.label}`}
                                          onCommit={(n) => patchRow(code, { marks: n, marksPinned: true })}
                                        />
                                      </div>
                                      <div className="col-start-2 row-start-1 flex items-center justify-end sm:col-start-auto sm:row-start-auto">
                                        <PinButton
                                          pinned={itemOn && item.marksPinned}
                                          name={item.label}
                                          onUnpin={() => patchRow(code, { marksPinned: false })}
                                        />
                                        <Tooltip title={item.isAllowed ? `Stop scoring ${item.label}` : `Score ${item.label}`}>
                                          <span>
                                            <Switch
                                              size="small"
                                              checked={item.isAllowed}
                                              disabled={!section.isAllowed}
                                              color="success"
                                              onChange={(e) =>
                                                patchRow(code, {
                                                  isAllowed: e.target.checked,
                                                  marksPinned: e.target.checked ? item.marksPinned : false,
                                                })
                                              }
                                              inputProps={{ "aria-label": `Score ${item.label}` }}
                                            />
                                          </span>
                                        </Tooltip>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </Collapse>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
