"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
  BRAND_PAGE_LEAD_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
} from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";

/**
 * @param {{ projectId: string }} props
 */
export function AcademicProjectParticipantsPanel({ projectId }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(/** @type {any} */ (null));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/participants`,
        { credentials: "include" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof json.error === "string" ? json.error : "Could not load participants.",
          severity: "error",
        });
        setData(null);
        return;
      }
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const p = data.project;
  const counts = data.counts || {};

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title={p.name}
        description="Read enrollment, attempt status, and jump to scoring or results."
      >
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip size="small" label={p.purpose} color="primary" />
          <Chip size="small" label={`Enrolled ${counts.enrolled || 0}`} />
          <Chip size="small" label={`In progress ${counts.inProgress || 0}`} />
          <Chip size="small" label={`Submitted ${counts.submitted || 0}`} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button component={Link} href="/projects" className="cursor-pointer">
            Projects
          </Button>
          <Button
            component={Link}
            href={`/projects/${projectId}/assessment`}
            className="cursor-pointer"
          >
            Scoring setup
          </Button>
          <Button
            component={Link}
            href={`/academic/results?projectId=${encodeURIComponent(projectId)}`}
            className="cursor-pointer"
          >
            Results
          </Button>
          <Button type="button" className="cursor-pointer" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </DashboardPageIntro>

      <h2 className={`${BRAND_SECTION_TITLE_CLASS} mb-2`}>Participants</h2>
      {!data.participants?.length ? (
        <p className={BRAND_PAGE_LEAD_CLASS}>No students have enrolled yet.</p>
      ) : (
        <TableContainer component={Paper} sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Student</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Attempts</TableCell>
                <TableCell>Progress</TableCell>
                <TableCell>Timer</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.participants.map((row) => (
                <TableRow key={row.enrollmentId}>
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
                  <TableCell>{row.status?.label || "—"}</TableCell>
                  <TableCell>{row.attemptCount}</TableCell>
                  <TableCell>
                    {row.progressPercent != null ? `${row.progressPercent}%` : "—"}
                    {row.currentStageLabel || row.currentStageKey ? (
                      <div className="text-xs opacity-70">
                        {row.currentStageLabel || row.currentStageKey}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {row.timer?.durationSeconds == null
                      ? "—"
                      : row.timer.expired
                        ? "Expired"
                        : `${row.timer.remainingSeconds}s left`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
