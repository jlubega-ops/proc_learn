"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRounded from "@mui/icons-material/VisibilityOffRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import AutorenewRounded from "@mui/icons-material/AutorenewRounded";
import ReplayRounded from "@mui/icons-material/ReplayRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import AssessmentRounded from "@mui/icons-material/AssessmentRounded";
import { ProjectSectionBar } from "@/components/projects/project-section-bar";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
  BRAND_PAGE_LEAD_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { BRAND_BTN_PRIMARY_CLASS } from "@/lib/brand-ui";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { ROLE } from "@/lib/roles";
import { campusSelectOptions } from "@/lib/campuses";
import { formatMarks } from "@/lib/academic/assessment-sections";
import { ResultsViewDialog } from "@/components/examiner/results-view-dialog";
import { clickableRowProps } from "@/lib/clickable-row";
import { actionConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { startVisibleInterval } from "@/lib/visible-interval";

/**
 * @param {{ projectId: string }} props
 */
export function AcademicProjectResultsPanel({ projectId }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { session } = useAuthSession();
  const canTeach = session?.activeRole === ROLE.EXAMINER;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(/** @type {any} */ (null));
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [campusFilter, setCampusFilter] = useState("");
  const [busy, setBusy] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const confirmModal = useConfirm();
  /** @type {[Set<string>, function]} */
  const [selected, setSelected] = useState(() => new Set());
  const [confirm, setConfirm] = useState(
    /** @type {null | { action: 'regrade' | 'force_submit' | 'regrade_all'; attemptIds: string[]; label: string }} */ (
      null
    ),
  );

  /**
   * @param {{ release: true; view: "SUMMARY" | "DETAILS" } | { release: false }} opts
   */
  async function updateRelease(opts) {
    if (!opts.release) {
      const ok = await confirmModal(
        actionConfirmOptions("Hide results", {
          message: "Students will no longer see their scores.",
          color: "warning",
        }),
      );
      if (!ok) return;
    }
    setReleasing(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assessment`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts.release ? { action: "release", view: opts.view } : { action: "unrelease" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof json.error === "string" ? json.error : "Could not update release.",
          severity: "error",
        });
        return;
      }
      setReleaseOpen(false);
      showToast({
        message: opts.release
          ? `${opts.view === "DETAILS" ? "Full results" : "Results overview"} released to students.`
          : "Results hidden from students.",
        severity: "success",
      });
      await load({ silent: true });
    } finally {
      setReleasing(false);
    }
  }

  /** @param {"SUMMARY" | "DETAILS"} view */
  async function exportExcel(view) {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/results/export?view=${view.toLowerCase()}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        showToast({
          message: typeof json.error === "string" ? json.error : "Export failed.",
          severity: "error",
        });
        return;
      }
      const blob = await res.blob();
      const header = res.headers.get("Content-Disposition") || "";
      const match = header.match(/filename="([^"]+)"/);
      const filename = match?.[1] || "proc-learn-grades.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
      showToast({
        message: view === "SUMMARY" ? "Results overview exported." : "Full results exported.",
        severity: "success",
      });
    } catch {
      showToast({ message: "Export failed.", severity: "error" });
    } finally {
      setExporting(false);
    }
  }

  const load = useCallback(
    async ({ silent } = {}) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/participants`,
          { credentials: "include" },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!silent) {
            showToast({
              message: typeof json.error === "string" ? json.error : "Could not load results.",
              severity: "error",
            });
          }
          if (!silent) setData(null);
          return;
        }
        setData(json);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [projectId, showToast],
  );

  useEffect(() => {
    void load();
    return startVisibleInterval(() => void load({ silent: true }), 30_000);
  }, [load]);

  const participants = data?.participants || [];
  const filteredParticipants = useMemo(() => {
    if (!campusFilter) return participants;
    return participants.filter((row) => row.campus === campusFilter);
  }, [participants, campusFilter]);
  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredParticipants.slice(start, start + rowsPerPage);
  }, [filteredParticipants, page, rowsPerPage]);

  const selectableAttemptIds = useMemo(
    () =>
      filteredParticipants
        .map((row) => row.latestAttempt?.id)
        .filter((id) => typeof id === "string" && id.length > 0),
    [filteredParticipants],
  );

  const pageAttemptIds = useMemo(
    () =>
      paged
        .map((row) => row.latestAttempt?.id)
        .filter((id) => typeof id === "string" && id.length > 0),
    [paged],
  );

  const allPageSelected =
    pageAttemptIds.length > 0 && pageAttemptIds.every((id) => selected.has(id));
  const somePageSelected = pageAttemptIds.some((id) => selected.has(id));

  function toggleOne(attemptId) {
    if (!attemptId) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(attemptId)) next.delete(attemptId);
      else next.add(attemptId);
      return next;
    });
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageAttemptIds.forEach((id) => next.delete(id));
      } else {
        pageAttemptIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  /**
   * @param {'regrade' | 'force_submit' | 'regrade_all'} action
   * @param {string[]} attemptIds
   */
  function askConfirm(action, attemptIds) {
    const count = action === "regrade_all" ? selectableAttemptIds.length : attemptIds.length;
    if (action !== "regrade_all" && count === 0) {
      showToast({ message: "Select at least one student with an attempt.", severity: "error" });
      return;
    }
    const label =
      action === "force_submit"
        ? `Force-submit and mark ${count} selected student(s)? In-progress work will be locked as submitted and scored.`
        : action === "regrade_all"
          ? `Regrade all ${count} attempt(s)? In-progress attempts are submitted first, then marked.`
          : `Regrade ${count} selected student(s)? In-progress attempts are submitted first, then marked.`;
    setConfirm({ action, attemptIds, label });
  }

  async function runConfirmed() {
    if (!confirm) return;
    const key =
      confirm.action === "regrade_all"
        ? "all"
        : confirm.action === "force_submit"
          ? "force"
          : "selected";
    setBusy(key);
    try {
      /** @type {Record<string, unknown>} */
      const finalBody =
        confirm.action === "force_submit"
          ? { action: "force_submit", attemptIds: confirm.attemptIds }
          : confirm.action === "regrade_all"
            ? { action: "regrade_all" }
            : { action: "regrade", attemptIds: confirm.attemptIds };

      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assessment`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalBody),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof json.error === "string" ? json.error : "Could not complete action.",
          severity: "error",
        });
        return;
      }
      const submitted = json.submitted || 0;
      const graded = json.graded || 0;
      showToast({
        message:
          confirm.action === "force_submit"
            ? `Force-submitted ${submitted} · marked ${graded}.`
            : `Submitted ${submitted} · regraded ${graded}.`,
        severity: "success",
      });
      setConfirm(null);
      setSelected(new Set());
      await load({ silent: true });
    } finally {
      setBusy("");
    }
  }

  if (loading && !data) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  if (!data) {
    return (
      <div className={BRAND_PAGE_SHELL_CLASS}>
        <DashboardPageIntro title="Results" description="Unavailable.">
          <Button component={Link} href="/projects" className="cursor-pointer">
            Back to Projects
          </Button>
        </DashboardPageIntro>
      </div>
    );
  }

  const counts = data.counts || {};
  const selectedCount = selected.size;
  const released = Boolean(data.scoring?.resultsReleased);

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <ProjectSectionBar
        icon={AssessmentRounded}
        title="Results"
        stats={
          <>
            <Chip size="small" color="info" label={`Enrolled ${counts.enrolled || 0}`} />
            <Chip size="small" color="warning" label={`In progress ${counts.inProgress || 0}`} />
            <Chip size="small" color="success" label={`Submitted ${counts.submitted || 0}`} />
            {data.scoring ? (
              <Chip
                size="small"
                variant="outlined"
                color={released ? "success" : "warning"}
                label={
                  released
                    ? `Released · ${data.scoring.resultsView === "DETAILS" ? "Full details" : "Overview"}`
                    : "Results hidden"
                }
              />
            ) : null}
          </>
        }
        actions={
          <>
            {participants.length ? (
              <FormControl sx={{ ...themedTextFieldSx, width: { xs: "100%", sm: 180 } }}>
                <InputLabel id="results-campus-filter">Campus</InputLabel>
                <Select
                  labelId="results-campus-filter"
                  label="Campus"
                  value={campusFilter}
                  onChange={(e) => {
                    setCampusFilter(String(e.target.value || ""));
                    setPage(0);
                  }}
                >
                  <MenuItem value="">All campuses</MenuItem>
                  {campusSelectOptions().map((c) => (
                    <MenuItem key={c.value} value={c.value}>
                      {c.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : null}
            {data.scoring && canTeach ? (
              <Tooltip title={released ? "Change what students see" : "Show results to students"}>
                <span>
                  <Button
                    type="button"
                    variant="outlined"
                    color="success"
                    disabled={releasing}
                    className="cursor-pointer disabled:cursor-not-allowed"
                    onClick={() => setReleaseOpen(true)}
                    startIcon={releasing ? <CircularProgress size={14} color="inherit" /> : <VisibilityRounded />}
                  >
                    {released ? "Change release" : "Release"}
                  </Button>
                </span>
              </Tooltip>
            ) : null}
            <Tooltip title="Download student details, times, and scores as Excel">
              <span>
                <Button
                  type="button"
                  variant="contained"
                  className={`${BRAND_BTN_PRIMARY_CLASS} cursor-pointer disabled:cursor-not-allowed`}
                  disabled={exporting}
                  startIcon={
                    exporting ? <CircularProgress size={14} color="inherit" /> : <DownloadRounded />
                  }
                  onClick={() => setExportOpen(true)}
                >
                  Excel
                </Button>
              </span>
            </Tooltip>
            <div className="flex items-center">
              {data.scoring && canTeach && released ? (
                <Tooltip title="Hide results from students">
                  <span>
                    <IconButton
                      aria-label="Hide results from students"
                      color="warning"
                      disabled={releasing}
                      onClick={() => void updateRelease({ release: false })}
                    >
                      <VisibilityOffRounded />
                    </IconButton>
                  </span>
                </Tooltip>
              ) : null}
              {canTeach ? (
                <Tooltip title="Regrade all submitted attempts">
                  <span>
                    <IconButton
                      aria-label="Regrade all submitted attempts"
                      color="primary"
                      disabled={Boolean(busy) || selectableAttemptIds.length === 0}
                      onClick={() => askConfirm("regrade_all", selectableAttemptIds)}
                    >
                      {busy === "all" ? <CircularProgress size={18} color="inherit" /> : <AutorenewRounded />}
                    </IconButton>
                  </span>
                </Tooltip>
              ) : null}
              <Tooltip title="Refresh">
                <IconButton aria-label="Refresh results" color="primary" onClick={() => void load()}>
                  <RefreshRounded />
                </IconButton>
              </Tooltip>
            </div>
          </>
        }
      >
        {canTeach && selectedCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--border-subtle)] pt-3">
            <Chip size="small" color="secondary" label={`${selectedCount} selected`} />
            <Button
              type="button"
              className="cursor-pointer disabled:cursor-not-allowed"
              disabled={Boolean(busy)}
              color="warning"
              variant="outlined"
              startIcon={
                busy === "selected" ? <CircularProgress size={14} color="inherit" /> : <ReplayRounded />
              }
              onClick={() => askConfirm("regrade", [...selected])}
            >
              Regrade
            </Button>
            <Button
              type="button"
              className="cursor-pointer disabled:cursor-not-allowed"
              disabled={Boolean(busy)}
              color="error"
              variant="outlined"
              startIcon={busy === "force" ? <CircularProgress size={14} color="inherit" /> : <SendRounded />}
              onClick={() => askConfirm("force_submit", [...selected])}
            >
              Force submit
            </Button>
          </div>
        ) : null}
      </ProjectSectionBar>

      {!participants.length ? (
        <p className={BRAND_PAGE_LEAD_CLASS}>No students have enrolled yet.</p>
      ) : (
        <>
        {!filteredParticipants.length ? (
          <p className={BRAND_PAGE_LEAD_CLASS}>No students match this campus.</p>
        ) : (
        <Paper sx={adminOutlinedTableContainerSx}>
          <TableContainer>
            <Table size="small" sx={adminTableSx}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      className="cursor-pointer"
                      checked={allPageSelected}
                      indeterminate={!allPageSelected && somePageSelected}
                      onChange={togglePage}
                      inputProps={{ "aria-label": "Select all students on this page" }}
                    />
                  </TableCell>
                  <TableCell>Student</TableCell>
                  <TableCell>Campus</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Where they are</TableCell>
                  <TableCell>Completed</TableCell>
                  <TableCell>Live score</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paged.map((row) => {
                  const attemptId = row.latestAttempt?.id || "";
                  const passAt = data.scoring?.passMarkPercent ?? 50;
                  const score = row.marks?.finalScore;
                  const total = row.marks?.totalMarks;
                  const percent = row.marks?.finalPercent;
                  return (
                    <TableRow
                      key={row.enrollmentId}
                      selected={attemptId ? selected.has(attemptId) : false}
                      {...clickableRowProps(router, `/projects/${projectId}/participants/${row.studentUserId}`)}
                    >
                      <TableCell padding="checkbox" data-row-click="ignore">
                        <Checkbox
                          className="cursor-pointer disabled:cursor-not-allowed"
                          disabled={!attemptId}
                          checked={Boolean(attemptId && selected.has(attemptId))}
                          onChange={() => toggleOne(attemptId)}
                          inputProps={{ "aria-label": `Select ${row.displayName}` }}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.displayName}</div>
                        <div className="text-xs text-zinc-500">{row.email}</div>
                        {row.studentNumber ? (
                          <div className="text-xs text-zinc-500">{row.studentNumber}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>{row.campusLabel || row.campus || "—"}</TableCell>
                      <TableCell>
                        <StatusChip status={row.status} />
                      </TableCell>
                      <TableCell>
                        {row.currentStageLabel || row.currentStageKey || "Not started"}
                        {row.progressPercent != null ? (
                          <div className="text-xs opacity-70">{row.progressPercent}% of path</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.marks?.completedCount != null
                          ? `${row.marks.completedCount}/${row.marks.allowedCount}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {score != null && total != null ? (
                          <div>
                            <span className="font-medium">
                              {formatMarks(score)}/{formatMarks(total)}
                            </span>
                            {percent != null ? (
                              <Chip
                                size="small"
                                className="ml-2"
                                color={percent >= passAt ? "success" : "warning"}
                                label={`${percent}%`}
                              />
                            ) : null}
                            {row.marks?.live ? (
                              <div className="text-xs text-primary">Live</div>
                            ) : null}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-nowrap justify-end gap-0.5">
                          {attemptId && canTeach ? (
                            <Tooltip title="Regrade (submits if still in progress)">
                              <span>
                                <IconButton
                                  size="small"
                                  color="warning"
                                  className="cursor-pointer disabled:cursor-not-allowed"
                                  disabled={Boolean(busy)}
                                  aria-label={`Regrade ${row.displayName}`}
                                  onClick={() => askConfirm("regrade", [attemptId])}
                                >
                                  <ReplayRounded fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          ) : null}
                          <Tooltip title="Open student report for this project">
                            <IconButton
                              component={Link}
                              href={`/projects/${projectId}/participants/${row.studentUserId}`}
                              size="small"
                              color="primary"
                              className="cursor-pointer"
                              aria-label={`Open report for ${row.displayName}`}
                            >
                              <VisibilityRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={filteredParticipants.length}
            page={page}
            onPageChange={(_e, next) => setPage(next)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setPage(0);
            }}
            rowsPerPageOptions={[5, 10, 20, 50]}
          />
        </Paper>
        )}
        </>
      )}

      <Dialog
        open={Boolean(confirm)}
        onClose={() => !busy && setConfirm(null)}
        PaperProps={{ sx: adminDialogPaperSx }}
      >
        <DialogTitle>
          {confirm?.action === "force_submit" ? "Force submit?" : "Regrade attempts?"}
        </DialogTitle>
        <DialogContent>
          <p className={BRAND_PAGE_LEAD_CLASS}>{confirm?.label}</p>
        </DialogContent>
        <DialogActions>
          <Button className="cursor-pointer" disabled={Boolean(busy)} onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button
            className="cursor-pointer disabled:cursor-not-allowed"
            variant="contained"
            color={confirm?.action === "force_submit" ? "error" : "warning"}
            disabled={Boolean(busy)}
            onClick={() => void runConfirmed()}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
      <ResultsViewDialog
        open={releaseOpen}
        title={released ? "Change release" : "Release results"}
        confirmLabel="Release"
        initialView={data.scoring?.resultsView}
        busy={releasing}
        onClose={() => setReleaseOpen(false)}
        onConfirm={(view) => void updateRelease({ release: true, view })}
      />
      <ResultsViewDialog
        open={exportOpen}
        title="Download Excel"
        confirmLabel="Download"
        initialView="DETAILS"
        busy={exporting}
        onClose={() => setExportOpen(false)}
        onConfirm={(view) => void exportExcel(view)}
      />
    </div>
  );
}

/**
 * @param {{ status?: { key?: string; label?: string } }} props
 */
function StatusChip({ status }) {
  const key = status?.key || "";
  const label = status?.label || "—";
  if (key === "in_progress") return <Chip size="small" color="info" label={label} />;
  if (key === "submitted" || key === "completed") {
    return <Chip size="small" color="success" label={label} />;
  }
  if (key === "not_started") return <Chip size="small" color="warning" label={label} />;
  return <Chip size="small" color="primary" label={label} />;
}
