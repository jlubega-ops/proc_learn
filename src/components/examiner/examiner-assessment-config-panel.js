"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Box from "@mui/material/Box";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import AddRounded from "@mui/icons-material/AddRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";
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

/**
 * Examiner assessment configuration for one Academic Project.
 * @param {{ projectId: string }} props
 */
export function ExaminerAssessmentConfigPanel({ projectId }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState(/** @type {any} */ (null));
  const [catalogue, setCatalogue] = useState(/** @type {any} */ (null));
  const [gradingMode, setGradingMode] = useState("COMBINED");
  const [manualMaxMarks, setManualMaxMarks] = useState("40");
  const [passMarkPercent, setPassMarkPercent] = useState("50");
  const [resultsReleased, setResultsReleased] = useState(false);
  const [checkpoints, setCheckpoints] = useState(/** @type {any[]} */ ([]));
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
          message: typeof json.error === "string" ? json.error : "Could not load assessment.",
          severity: "error",
        });
        return;
      }
      setProject(json.project || null);
      setCatalogue(json.catalogue || null);
      const a = json.assessment;
      if (a) {
        setGradingMode(a.gradingMode || "COMBINED");
        setManualMaxMarks(String(a.manualMaxMarks ?? 0));
        setPassMarkPercent(String(a.passMarkPercent ?? 50));
        setResultsReleased(Boolean(a.resultsReleased));
        setCheckpoints(
          (a.checkpoints || []).map((c) => ({
            label: c.label,
            kind: c.kind,
            stageKey: c.stageKey || "",
            procurementMethod: c.procurementMethod || "",
            marks: String(c.marks ?? 0),
            isActive: c.isActive !== false,
          })),
        );
      } else {
        setCheckpoints([
          {
            label: "Attempt submitted",
            kind: "ATTEMPT_SUBMITTED",
            stageKey: "",
            procurementMethod: "",
            marks: "10",
            isActive: true,
          },
          {
            label: "Requisition approved",
            kind: "STAGE_COMPLETED",
            stageKey: "APPROVAL",
            procurementMethod: "",
            marks: "30",
            isActive: true,
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setFieldErrors({});
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assessment`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gradingMode,
          manualMaxMarks: Number(manualMaxMarks),
          passMarkPercent: Number(passMarkPercent),
          resultsReleased,
          checkpoints: checkpoints.map((c) => ({
            ...c,
            marks: Number(c.marks),
          })),
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
      showToast({ message: "Assessment configuration saved.", severity: "success" });
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
      </Box>
    );
  }

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title={project?.name || "Assessment scoring"}
        description="Configure automatic checkpoints from real procurement progress, plus optional manual marks. Final score = auto + manual (capped at total)."
      >
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip size="small" label={project?.purpose || "Project"} color="primary" />
          <Chip
            size="small"
            label={resultsReleased ? "Results released" : "Results not released"}
            color={resultsReleased ? "success" : "warning"}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button component={Link} href={`/projects/${projectId}/participants`} className="cursor-pointer">
            Participants
          </Button>
          <Button
            component={Link}
            href={`/academic/results?projectId=${encodeURIComponent(projectId)}`}
            className="cursor-pointer"
          >
            Results
          </Button>
          <Button component={Link} href="/projects" className="cursor-pointer">
            Back
          </Button>
        </div>
      </DashboardPageIntro>

      <p className={`${BRAND_PAGE_LEAD_CLASS} mb-4`}>
        Automatic checks read My Organisation procurement state. They do not invent a second workflow
        engine.
      </p>

      <form
        noValidate
        className={`${BRAND_CARD_CLASS} space-y-4 p-4`}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Scoring</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormControl fullWidth>
            <InputLabel id="grading-mode-label">Scoring mode</InputLabel>
            <Select
              labelId="grading-mode-label"
              label="Scoring mode"
              value={gradingMode}
              onChange={(e) => setGradingMode(e.target.value)}
              className="cursor-pointer"
            >
              {(catalogue?.gradingModes || []).map((m) => (
                <MenuItem key={m.value} value={m.value} className="cursor-pointer">
                  {m.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Manual marks (max)"
            value={manualMaxMarks}
            onChange={(e) => setManualMaxMarks(e.target.value)}
            error={Boolean(fieldErrors.manualMaxMarks)}
            helperText={fieldErrors.manualMaxMarks || "0 when automatic-only"}
            sx={themedTextFieldSx}
            disabled={gradingMode === "AUTOMATIC"}
          />
          <TextField
            label="Pass mark (%)"
            value={passMarkPercent}
            onChange={(e) => setPassMarkPercent(e.target.value)}
            error={Boolean(fieldErrors.passMarkPercent)}
            helperText={fieldErrors.passMarkPercent || "Default 50"}
            sx={themedTextFieldSx}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={BRAND_SECTION_TITLE_CLASS}>Checkpoints</h2>
          <Button
            type="button"
            startIcon={<AddRounded />}
            className="cursor-pointer"
            onClick={() =>
              setCheckpoints((prev) => [
                ...prev,
                {
                  label: "New checkpoint",
                  kind: "STAGE_COMPLETED",
                  stageKey: "BUDGET",
                  procurementMethod: "",
                  marks: "10",
                  isActive: true,
                },
              ])
            }
          >
            Add checkpoint
          </Button>
        </div>
        {fieldErrors.checkpoints ? (
          <p className="text-sm text-brand-red">{fieldErrors.checkpoints}</p>
        ) : null}

        <div className="space-y-3">
          {checkpoints.map((cp, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-12">
              <TextField
                className="sm:col-span-4"
                label="Label"
                value={cp.label}
                onChange={(e) => {
                  const next = [...checkpoints];
                  next[index] = { ...cp, label: e.target.value };
                  setCheckpoints(next);
                }}
                sx={themedTextFieldSx}
              />
              <FormControl className="sm:col-span-3" fullWidth>
                <InputLabel id={`kind-${index}`}>Type</InputLabel>
                <Select
                  labelId={`kind-${index}`}
                  label="Type"
                  value={cp.kind}
                  onChange={(e) => {
                    const next = [...checkpoints];
                    next[index] = { ...cp, kind: e.target.value };
                    setCheckpoints(next);
                  }}
                  className="cursor-pointer"
                >
                  {(catalogue?.kinds || []).map((k) => (
                    <MenuItem key={k.value} value={k.value} className="cursor-pointer">
                      {k.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {(cp.kind === "STAGE_COMPLETED" || cp.kind === "STAGE_REACHED") && (
                <FormControl className="sm:col-span-3" fullWidth>
                  <InputLabel id={`stage-${index}`}>Stage</InputLabel>
                  <Select
                    labelId={`stage-${index}`}
                    label="Stage"
                    value={cp.stageKey || ""}
                    onChange={(e) => {
                      const next = [...checkpoints];
                      next[index] = { ...cp, stageKey: e.target.value };
                      setCheckpoints(next);
                    }}
                    className="cursor-pointer"
                    error={Boolean(fieldErrors[`checkpoints.${index}.stageKey`])}
                  >
                    {(catalogue?.stages || []).map((s) => (
                      <MenuItem key={s.value} value={s.value} className="cursor-pointer">
                        {s.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              {cp.kind === "PROCUREMENT_METHOD" && (
                <FormControl className="sm:col-span-3" fullWidth>
                  <InputLabel id={`method-${index}`}>Method</InputLabel>
                  <Select
                    labelId={`method-${index}`}
                    label="Method"
                    value={cp.procurementMethod || ""}
                    onChange={(e) => {
                      const next = [...checkpoints];
                      next[index] = { ...cp, procurementMethod: e.target.value };
                      setCheckpoints(next);
                    }}
                    className="cursor-pointer"
                  >
                    {(catalogue?.methods || []).map((m) => (
                      <MenuItem key={m.value} value={m.value} className="cursor-pointer">
                        {m.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <TextField
                className="sm:col-span-1"
                label="Marks"
                value={cp.marks}
                onChange={(e) => {
                  const next = [...checkpoints];
                  next[index] = { ...cp, marks: e.target.value };
                  setCheckpoints(next);
                }}
                sx={themedTextFieldSx}
                error={Boolean(fieldErrors[`checkpoints.${index}.marks`])}
              />
              <div className="flex items-center sm:col-span-1">
                <Tooltip title="Remove checkpoint">
                  <IconButton
                    color="error"
                    aria-label="Remove checkpoint"
                    className="cursor-pointer"
                    onClick={() => setCheckpoints((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <DeleteOutlineRounded />
                  </IconButton>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            type="submit"
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveRounded />}
            disabled={saving}
            className={`${BRAND_BTN_PRIMARY_CLASS} cursor-pointer disabled:cursor-not-allowed`}
          >
            {saving ? "Saving…" : "Save configuration"}
          </Button>
          <Button
            type="button"
            variant="outlined"
            disabled={saving}
            className="cursor-pointer disabled:cursor-not-allowed"
            onClick={() => void toggleRelease(!resultsReleased)}
          >
            {resultsReleased ? "Hide results from students" : "Release results to students"}
          </Button>
        </div>
      </form>
    </div>
  );
}
