"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import AutorenewRounded from "@mui/icons-material/AutorenewRounded";
import ReplayRounded from "@mui/icons-material/ReplayRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
  BRAND_PAGE_LEAD_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
} from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";

/**
 * @param {{ projectId: string }} props
 */
export function AcademicProjectResultsPanel({ projectId }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(/** @type {any} */ (null));
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [busy, setBusy] = useState("");
  /** @type {[Set<string>, function]} */
  const [selected, setSelected] = useState(() => new Set());
  const [confirm, setConfirm] = useState(
    /** @type {null | { action: 'regrade' | 'force_submit' | 'regrade_all'; attemptIds: string[]; label: string }} */ (
      null
    ),
  );

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
    const timer = setInterval(() => void load({ silent: true }), 15000);
    return () => clearInterval(timer);
  }, [load]);

  const participants = data?.participants || [];
  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return participants.slice(start, start + rowsPerPage);
  }, [participants, page, rowsPerPage]);

  const selectableAttemptIds = useMemo(
    () =>
      participants
        .map((row) => row.latestAttempt?.id)
        .filter((id) => typeof id === "string" && id.length > 0),
    [participants],
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

  const p = data.project;
  const counts = data.counts || {};
  const selectedCount = selected.size;

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title="Results"
        description={`${p.name}: live scores for enrolled students. Regrade submits in-progress work first, then marks. You can select one or many students.`}
      >
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip size="small" color="primary" label={p.purpose} />
          <Chip size="small" color="info" label={`Enrolled ${counts.enrolled || 0}`} />
          <Chip size="small" color="warning" label={`In progress ${counts.inProgress || 0}`} />
          <Chip size="small" color="success" label={`Submitted ${counts.submitted || 0}`} />
          {selectedCount > 0 ? (
            <Chip size="small" color="secondary" label={`${selectedCount} selected`} />
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            className="cursor-pointer"
            startIcon={<RefreshRounded />}
            onClick={() => void load()}
          >
            Refresh
          </Button>
          <Button
            type="button"
            className="cursor-pointer disabled:cursor-not-allowed"
            disabled={Boolean(busy) || selectedCount === 0}
            color="warning"
            variant="outlined"
            startIcon={
              busy === "selected" ? <CircularProgress size={14} color="inherit" /> : <ReplayRounded />
            }
            onClick={() => askConfirm("regrade", [...selected])}
          >
            Regrade selected
          </Button>
          <Button
            type="button"
            className="cursor-pointer disabled:cursor-not-allowed"
            disabled={Boolean(busy) || selectedCount === 0}
            color="error"
            variant="outlined"
            startIcon={
              busy === "force" ? <CircularProgress size={14} color="inherit" /> : <SendRounded />
            }
            onClick={() => askConfirm("force_submit", [...selected])}
          >
            Force submit selected
          </Button>
          <Button
            type="button"
            className="cursor-pointer disabled:cursor-not-allowed"
            disabled={Boolean(busy) || selectableAttemptIds.length === 0}
            startIcon={
              busy === "all" ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <AutorenewRounded />
              )
            }
            onClick={() => askConfirm("regrade_all", selectableAttemptIds)}
          >
            Regrade all
          </Button>
          <Button component={Link} href={`/projects/${projectId}/assessment`} className="cursor-pointer">
            Scoring setup
          </Button>
        </div>
      </DashboardPageIntro>

      <h2 className={`${BRAND_SECTION_TITLE_CLASS} mb-2`}>Enrolled students</h2>
      {!participants.length ? (
        <p className={BRAND_PAGE_LEAD_CLASS}>No students have enrolled yet.</p>
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
                  const completed = (row.processScores || []).filter((x) => x.satisfied);
                  const remaining = (row.processScores || []).filter((x) => !x.satisfied);
                  const passAt = data.scoring?.passMarkPercent ?? 50;
                  const score = row.marks?.finalScore;
                  const total = row.marks?.totalMarks;
                  const percent = row.marks?.finalPercent;
                  return (
                    <TableRow key={row.enrollmentId} selected={attemptId ? selected.has(attemptId) : false}>
                      <TableCell padding="checkbox">
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
                      <TableCell>
                        <StatusChip status={row.status} />
                      </TableCell>
                      <TableCell>
                        {row.currentStageLabel || row.currentStageKey || "Not started"}
                        {row.progressPercent != null ? (
                          <div className="text-xs opacity-70">{row.progressPercent}% of path</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {row.marks?.completedCount != null ? (
                          <div>
                            {row.marks.completedCount}/{row.marks.allowedCount} processes
                          </div>
                        ) : (
                          "—"
                        )}
                        {completed.length ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {completed.slice(0, 4).map((proc) => (
                              <Chip
                                key={proc.processCode}
                                size="small"
                                color="success"
                                label={`${proc.label} +${proc.awarded}`}
                              />
                            ))}
                          </div>
                        ) : null}
                        {remaining.length && completed.length ? (
                          <div className="mt-1 text-xs text-zinc-500">
                            Next: {remaining[0]?.label}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {score != null && total != null ? (
                          <div>
                            <span className="font-medium">
                              {score}/{total}
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
                          {attemptId ? (
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
            count={participants.length}
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
