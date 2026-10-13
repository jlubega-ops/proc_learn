"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
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
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import GroupsRounded from "@mui/icons-material/GroupsRounded";
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
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";
import { formatDurationClock } from "@/lib/academic/attempt-timer-format";
import { campusSelectOptions } from "@/lib/campuses";
import { clickableRowProps } from "@/lib/clickable-row";
import { startVisibleInterval } from "@/lib/visible-interval";

/**
 * @param {{ projectId: string }} props
 */
export function AcademicProjectParticipantsPanel({ projectId }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(/** @type {any} */ (null));
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [campusFilter, setCampusFilter] = useState("");

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
              message:
                typeof json.error === "string" ? json.error : "Could not load participants.",
              severity: "error",
            });
            setData(null);
          }
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
        <DashboardPageIntro title="Participants" description="Unavailable.">
          <Button component={Link} href="/projects" className="cursor-pointer">
            Back to Projects
          </Button>
        </DashboardPageIntro>
      </div>
    );
  }

  const counts = data.counts || {};

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <ProjectSectionBar
        icon={GroupsRounded}
        title="Participants"
        stats={
          <>
            <Chip size="small" color="info" label={`Enrolled ${counts.enrolled || 0}`} />
            <Chip size="small" color="warning" label={`In progress ${counts.inProgress || 0}`} />
            <Chip size="small" color="success" label={`Submitted ${counts.submitted || 0}`} />
          </>
        }
        actions={
          <>
            {participants.length ? (
              <FormControl sx={{ ...themedTextFieldSx, width: { xs: "100%", sm: 180 } }}>
                <InputLabel id="participants-campus-filter">Campus</InputLabel>
                <Select
                  labelId="participants-campus-filter"
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
            <Tooltip title="Refresh">
              <IconButton aria-label="Refresh participants" color="primary" onClick={() => void load()}>
                <RefreshRounded />
              </IconButton>
            </Tooltip>
          </>
        }
      />

      {!participants.length ? (
        <p className={BRAND_PAGE_LEAD_CLASS}>No students have enrolled yet.</p>
      ) : (
        <>
        {!filteredParticipants.length ? (
          <p className={BRAND_PAGE_LEAD_CLASS}>No participants match this campus.</p>
        ) : (
        <Paper sx={adminOutlinedTableContainerSx}>
          <TableContainer>
            <Table size="small" sx={adminTableSx}>
              <TableHead>
                <TableRow>
                  <TableCell>Student</TableCell>
                  <TableCell>Campus</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Stage</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell>Live score</TableCell>
                  <TableCell>Attempts</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paged.map((row) => (
                  <TableRow
                    key={row.enrollmentId}
                    {...clickableRowProps(router, `/projects/${projectId}/participants/${row.studentUserId}`)}
                  >
                    <TableCell>
                      <div className="font-medium">{row.displayName}</div>
                      <div className="text-xs text-zinc-500">{row.email}</div>
                      {row.participationType && row.participationType !== "STUDENT" ? (
                        <Chip
                          size="small"
                          color="warning"
                          className="mt-1"
                          label={
                            row.participationType === "EXAMINER_DEMO"
                              ? "Examiner demo"
                              : "System admin demo"
                          }
                        />
                      ) : null}
                    </TableCell>
                    <TableCell>{row.campusLabel || row.campus || "—"}</TableCell>
                    <TableCell>
                      <StatusChip status={row.status} />
                    </TableCell>
                    <TableCell>
                      {row.currentStageLabel || row.currentStageKey || "—"}
                      {row.progressPercent != null ? (
                        <div className="text-xs opacity-70">{row.progressPercent}%</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {row.timer?.expired ? (
                        <Chip size="small" color="error" label="Time up" />
                      ) : row.timer?.remainingSeconds != null ? (
                        <div>
                          <span className="font-medium">
                            {formatDurationClock(row.timer.remainingSeconds)} left
                          </span>
                          <div className="text-xs text-zinc-500">
                            Used {formatDurationClock(row.timer.elapsedSeconds)}
                          </div>
                        </div>
                      ) : row.timer?.mode === "NONE" ? (
                        "No limit"
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {row.marks?.finalScore != null && row.marks?.totalMarks != null ? (
                        <div>
                          {row.marks.finalScore}/{row.marks.totalMarks}
                          {row.marks.finalPercent != null ? ` (${row.marks.finalPercent}%)` : ""}
                          {row.marks.live ? (
                            <div className="text-xs text-primary">Live</div>
                          ) : null}
                        </div>
                      ) : row.marks?.finalPercent != null ? (
                        `${row.marks.finalPercent}%`
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{row.attemptCount}</TableCell>
                    <TableCell align="right">
                      <div className="flex flex-nowrap justify-end">
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
                ))}
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
