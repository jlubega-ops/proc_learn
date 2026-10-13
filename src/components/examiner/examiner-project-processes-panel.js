"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Switch from "@mui/material/Switch";
import Tooltip from "@mui/material/Tooltip";
import LockRounded from "@mui/icons-material/LockRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";
import UndoRounded from "@mui/icons-material/UndoRounded";
import AccountTreeRounded from "@mui/icons-material/AccountTreeRounded";
import { BRAND_PAGE_SHELL_CLASS } from "@/components/layout/dashboard-page-intro";
import { BRAND_BTN_PRIMARY_CLASS } from "@/lib/brand-ui";
import { ProjectSectionBar } from "@/components/projects/project-section-bar";
import { adminCenteredLoadingBoxSx, adminLoadingSpinnerSx } from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { useDraftSync } from "@/hooks/use-draft-sync";
import { ROLE } from "@/lib/roles";
import { SCORING_GROUP_LABELS } from "@/lib/academic/assessment-sections";
import { validateAllowedProcessSet } from "@/lib/academic/assessment-process-catalogue";
import {
  processActivationBlockers,
  processDeactivationBlockers,
  processNeedsLabel,
} from "@/lib/projects/process-dependencies";

const MUTED_CLASS = "text-xs text-zinc-500 dark:text-zinc-400";

/**
 * @typedef {{ code: string; name: string; summary: string; group: string; defaultAllowed: boolean }} CatalogueProcess
 */

/**
 * Processes students may run while attempting this project (independent of scoring).
 * @param {{ projectId: string }} props
 */
export function ExaminerProjectProcessesPanel({ projectId }) {
  const { showToast } = useToast();
  const { session } = useAuthSession();
  const canTeach = session?.activeRole === ROLE.EXAMINER;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalogue, setCatalogue] = useState(/** @type {CatalogueProcess[]} */ ([]));
  const [saved, setSaved] = useState(/** @type {string[]} */ ([]));
  const [enabled, setEnabled] = useState(/** @type {string[]} */ ([]));
  const [scored, setScored] = useState(/** @type {Set<string>} */ (new Set()));
  const [programmeCodes, setProgrammeCodes] = useState(/** @type {string[] | null} */ (null));
  const [loadedOnce, setLoadedOnce] = useState(false);

  const processesDraft = useDraftSync(
    `project:processes:${projectId}`,
    { enabled },
    (d) => {
      if (Array.isArray(d.enabled)) setEnabled(d.enabled.filter((c) => typeof c === "string"));
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
          message: typeof json.error === "string" ? json.error : "Could not load processes.",
          severity: "error",
        });
        return;
      }
      const list = Array.isArray(json.catalogue?.processes) ? json.catalogue.processes : [];
      setCatalogue(list);
      const a = json.assessment;
      const programme = Array.isArray(a?.programmeProcessCodes) ? a.programmeProcessCodes : null;
      const programmeSet = programme ? new Set(programme) : null;
      const codes = (
        Array.isArray(a?.enabledProcessCodes)
          ? a.enabledProcessCodes
          : list.filter((p) => p.defaultAllowed).map((p) => p.code)
      ).filter((/** @type {string} */ c) => !programmeSet || programmeSet.has(c));
      setProgrammeCodes(programme);
      setSaved(codes);
      setEnabled(codes);
      setScored(
        new Set(
          (Array.isArray(a?.sections) ? a.sections : [])
            .filter((s) => s.processCode && s.isAllowed && a?.scoringEnabled !== false)
            .map((s) => s.key),
        ),
      );
      setLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const enabledSet = useMemo(() => new Set(enabled), [enabled]);
  const programmeSet = useMemo(() => (programmeCodes ? new Set(programmeCodes) : null), [programmeCodes]);
  const dirty = useMemo(() => {
    if (saved.length !== enabled.length) return true;
    const s = new Set(saved);
    return enabled.some((c) => !s.has(c));
  }, [saved, enabled]);
  const setErrors = useMemo(() => validateAllowedProcessSet(enabled), [enabled]);

  /** @param {string} code @param {boolean} on */
  function toggle(code, on) {
    setEnabled((prev) => (on ? [...new Set([...prev, code])] : prev.filter((c) => c !== code)));
  }

  async function save() {
    if (setErrors.length) {
      showToast({ message: setErrors[0], severity: "error" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assessment`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_processes", enabledProcessCodes: enabled }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof json.error === "string" ? json.error : "Could not save processes.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Processes saved.", severity: "success" });
      await load();
      processesDraft.clearDraft();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
        <CircularProgress sx={adminLoadingSpinnerSx} />
        <p className="mt-2 text-sm">Loading processes…</p>
      </Box>
    );
  }

  const names = Object.fromEntries(catalogue.map((p) => [p.code, p.name]));
  const groupKeys = Object.keys(SCORING_GROUP_LABELS).filter((g) => g !== "ORG");

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <ProjectSectionBar
        icon={AccountTreeRounded}
        title="Processes"
        stats={
          <>
            <Chip
              size="small"
              color="primary"
              label={`${enabled.length} of ${programmeCodes ? programmeCodes.length : catalogue.length} enabled`}
            />
            {dirty ? <Chip size="small" color="warning" label="Unsaved changes" /> : null}
            {!canTeach ? <Chip size="small" color="info" label="View only" /> : null}
          </>
        }
        actions={
          canTeach ? (
            <>
              {dirty ? (
                <Button
                  type="button"
                  variant="outlined"
                  disabled={saving}
                  className="cursor-pointer disabled:cursor-not-allowed"
                  onClick={() => {
                    processesDraft.clearDraft();
                    setEnabled(saved);
                  }}
                  startIcon={<UndoRounded />}
                >
                  Discard
                </Button>
              ) : null}
              <Button
                type="button"
                variant="contained"
                disabled={saving || !dirty}
                className={`${BRAND_BTN_PRIMARY_CLASS} cursor-pointer disabled:cursor-not-allowed`}
                onClick={() => void save()}
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveRounded />}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </>
          ) : null
        }
      >
        {setErrors.length ? (
          <Alert severity="error" role="alert" className="mb-3">
            {setErrors[0]}
          </Alert>
        ) : null}
        <div className="space-y-4">
          {groupKeys.map((groupKey) => {
            const items = catalogue.filter((p) => p.group === groupKey);
            if (!items.length) return null;
            return (
              <div key={groupKey}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">
                  {SCORING_GROUP_LABELS[groupKey]}
                </h3>
                <ul className="divide-y divide-[color:var(--border-subtle)] rounded-lg border border-[color:var(--border-subtle)]">
                  {items.map((p) => {
                    const on = enabledSet.has(p.code);
                    const programmeOff = Boolean(programmeSet && !programmeSet.has(p.code));
                    const blockers = programmeOff
                      ? ["Disabled for this programme and year."]
                      : on
                        ? processDeactivationBlockers(p.code, enabled, names)
                        : processActivationBlockers(p.code, enabled, names);
                    const locked = blockers.length > 0;
                    const needs = processNeedsLabel(p.code, names);
                    return (
                      <li
                        key={p.code}
                        className="flex items-center gap-3 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-foreground">{p.name}</span>
                            {programmeOff ? (
                              <Chip size="small" color="error" variant="outlined" label="Off for programme" />
                            ) : (
                              <Chip
                                size="small"
                                variant="outlined"
                                color={on ? "primary" : "warning"}
                                label={on ? "Enabled" : "Disabled"}
                              />
                            )}
                            {on && scored.has(p.code) ? (
                              <Chip size="small" color="success" variant="outlined" label="Scored" />
                            ) : null}
                            {locked ? (
                              <Tooltip title={blockers.join(" ")}>
                                <LockRounded fontSize="small" color="warning" aria-label={blockers[0]} />
                              </Tooltip>
                            ) : null}
                          </div>
                          <p className={MUTED_CLASS}>{p.summary}</p>
                          {needs ? <p className={MUTED_CLASS}>Needs {needs}</p> : null}
                        </div>
                        <Tooltip
                          title={
                            !canTeach
                              ? on
                                ? "Enabled"
                                : "Disabled"
                              : locked
                                ? blockers[0]
                                : on
                                  ? `Disable ${p.name} for students`
                                  : `Enable ${p.name} for students`
                          }
                        >
                          <span>
                            <Switch
                              checked={on}
                              disabled={!canTeach || locked || saving}
                              color="success"
                              onChange={(e) => toggle(p.code, e.target.checked)}
                              inputProps={{ "aria-label": `${on ? "Disable" : "Enable"} ${p.name}` }}
                            />
                          </span>
                        </Tooltip>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </ProjectSectionBar>
    </div>
  );
}
