"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Box from "@mui/material/Box";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import GradeRounded from "@mui/icons-material/GradeRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import { format, parseISO, isValid } from "date-fns";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
  BRAND_PAGE_LEAD_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { BRAND_BTN_PRIMARY_CLASS, BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";
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

function fmtDate(value) {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : new Date(value);
  return isValid(d) ? format(d, "MMM d, yyyy") : "—";
}

/**
 * Examiner Results / Student Results router panel.
 */
export function AcademicResultsPanel() {
  const { session, loading: sessionLoading } = useAuthSession();
  const activeRole = session?.user?.activeRole || session?.activeRole;
  const isStudent = activeRole === ROLE.STUDENT;

  if (sessionLoading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  if (isStudent) return <StudentResultsView />;
  return <ExaminerResultsView />;
}

function StudentResultsView() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState(/** @type {any[]} */ ([]));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/student/results", { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast({
            message: typeof json.error === "string" ? json.error : "Could not load results.",
            severity: "error",
          });
          return;
        }
        if (!cancelled) setResults(json.results || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

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
        title="Results"
        description="Scores and feedback appear here after your examiner releases results."
      />
      {results.length === 0 ? (
        <p className={BRAND_PAGE_LEAD_CLASS}>No scored projects yet.</p>
      ) : (
        <TableContainer sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Project</TableCell>
                <TableCell>Attempt</TableCell>
                <TableCell>Score</TableCell>
                <TableCell>Result</TableCell>
                <TableCell>Feedback</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.map((row) => (
                <TableRow key={row.attemptId}>
                  <TableCell>
                    <Link
                      href={
                        row.purpose === "ASSESSMENT"
                          ? `/academic/assessments/${row.projectId}`
                          : `/academic/practice/${row.projectId}`
                      }
                      className="cursor-pointer text-primary underline-offset-2 hover:underline"
                    >
                      {row.projectName}
                    </Link>
                  </TableCell>
                  <TableCell>#{row.attemptNumber}</TableCell>
                  <TableCell>
                    {row.scoreVisible
                      ? `${row.grade?.finalScore ?? "—"} (${row.grade?.finalPercent ?? "—"}%)`
                      : row.resultsReleased
                        ? "Pending"
                        : "Not released"}
                  </TableCell>
                  <TableCell>
                    {row.scoreVisible ? row.grade?.passFailLabel || "—" : "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {row.scoreVisible ? row.grade?.feedback || "—" : "—"}
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

function ExaminerResultsView() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const initialProjectId = searchParams.get("projectId") || "";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(/** @type {any} */ (null));
  const [years, setYears] = useState(/** @type {any[]} */ ([]));
  const [academicYearId, setAcademicYearId] = useState("");
  const [participation, setParticipation] = useState("all");
  const [projectId, setProjectId] = useState(initialProjectId);
  const [projects, setProjects] = useState(/** @type {any[]} */ ([]));
  const [gradeRow, setGradeRow] = useState(/** @type {any} */ (null));
  const [manualScore, setManualScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [gradeBusy, setGradeBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}));

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/academic-years", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      const list = json.academicYears || [];
      setYears(Array.isArray(list) ? list : []);
    })();
    (async () => {
      const res = await fetch("/api/projects?page=1&pageSize=50&scope=examiner", {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      const list = json.projects || json.items || [];
      setProjects(Array.isArray(list) ? list.filter((p) => !p.isPersonalOrg) : []);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (academicYearId) qs.set("academicYearId", academicYearId);
      if (projectId) qs.set("projectId", projectId);
      qs.set("participation", participation);
      const res = await fetch(`/api/academic/results?${qs.toString()}`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof json.error === "string" ? json.error : "Could not load results.",
          severity: "error",
        });
        setData(null);
        return;
      }
      setData(json);
      if (!academicYearId && json.filter?.academicYearId) {
        setAcademicYearId(json.filter.academicYearId);
      }
    } finally {
      setLoading(false);
    }
  }, [academicYearId, participation, projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportExcel() {
    const qs = new URLSearchParams();
    if (academicYearId) qs.set("academicYearId", academicYearId);
    if (projectId) qs.set("projectId", projectId);
    const res = await fetch(`/api/academic/results/export?${qs.toString()}`, {
      credentials: "include",
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      showToast({
        message: typeof json.error === "string" ? json.error : "Export failed.",
        severity: "error",
      });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "proc-learn-official-results.xlsx";
    a.click();
    URL.revokeObjectURL(url);
    showToast({ message: "Official student results exported.", severity: "success" });
  }

  async function saveGrade() {
    if (!gradeRow) return;
    setGradeBusy(true);
    setFieldErrors({});
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(gradeRow.projectId)}/attempts/${encodeURIComponent(gradeRow.attemptId)}/grade`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "manual",
            manualScore: Number(manualScore),
            feedback,
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.errors) setFieldErrors(json.errors);
        showToast({
          message: typeof json.error === "string" ? json.error : "Could not save grade.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Grade saved.", severity: "success" });
      setGradeRow(null);
      await load();
    } finally {
      setGradeBusy(false);
    }
  }

  async function recalculate(row) {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(row.projectId)}/attempts/${encodeURIComponent(row.attemptId)}/grade`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto" }),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast({
        message: typeof json.error === "string" ? json.error : "Recalculate failed.",
        severity: "error",
      });
      return;
    }
    showToast({ message: "Automatic score refreshed.", severity: "success" });
    await load();
  }

  const stats = data?.officialStats;

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title="Results"
        description="View attempts, scores, and grades. Official statistics and Excel export include real students only — demo participation is excluded server-side."
      >
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            startIcon={<RefreshRounded />}
            onClick={() => void load()}
            className="cursor-pointer"
          >
            Refresh
          </Button>
          <Button
            startIcon={<DownloadRounded />}
            variant="contained"
            className={`${BRAND_BTN_PRIMARY_CLASS} cursor-pointer`}
            onClick={() => void exportExcel()}
          >
            Export official Excel
          </Button>
          {projectId ? (
            <Button
              component={Link}
              href={`/projects/${projectId}/assessment`}
              startIcon={<SettingsRounded />}
              className="cursor-pointer"
            >
              Scoring setup
            </Button>
          ) : null}
        </div>
      </DashboardPageIntro>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <FormControl fullWidth>
          <InputLabel id="ay-filter">Academic year</InputLabel>
          <Select
            labelId="ay-filter"
            label="Academic year"
            value={academicYearId}
            onChange={(e) => setAcademicYearId(e.target.value)}
            className="cursor-pointer"
          >
            {years.map((y) => (
              <MenuItem key={y.id} value={y.id} className="cursor-pointer">
                {y.label}
                {y.isCurrent ? " (current)" : ""}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel id="proj-filter">Project</InputLabel>
          <Select
            labelId="proj-filter"
            label="Project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="cursor-pointer"
          >
            <MenuItem value="" className="cursor-pointer">
              All projects with scoring
            </MenuItem>
            {projects.map((p) => (
              <MenuItem key={p.id} value={p.id} className="cursor-pointer">
                {p.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel id="part-filter">Participants</InputLabel>
          <Select
            labelId="part-filter"
            label="Participants"
            value={participation}
            onChange={(e) => setParticipation(e.target.value)}
            className="cursor-pointer"
          >
            <MenuItem value="all" className="cursor-pointer">
              All (demos badge)
            </MenuItem>
            <MenuItem value="students" className="cursor-pointer">
              Official students
            </MenuItem>
            <MenuItem value="demo" className="cursor-pointer">
              Demo only
            </MenuItem>
          </Select>
        </FormControl>
      </div>

      {stats ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Chip color="primary" label={`Official ${stats.officialCount}`} />
          <Chip color="warning" label={`Demo excluded ${stats.demoExcludedCount}`} />
          <Chip label={`Submitted ${stats.submittedCount}`} />
          <Chip label={`In progress ${stats.inProgressCount}`} />
          <Chip label={`Graded ${stats.gradedCount}`} />
          <Chip
            color="success"
            label={`Average ${stats.averagePercent == null ? "—" : `${stats.averagePercent}%`}`}
          />
          <Chip
            label={`Pass rate ${stats.passRatePercent == null ? "—" : `${stats.passRatePercent}%`}`}
          />
          <Chip color="success" label={`Pass ${stats.passCount}`} />
          <Chip color="error" label={`Fail ${stats.failCount}`} />
        </div>
      ) : null}

      <p className={`${BRAND_PAGE_LEAD_CLASS} mb-2`}>
        Averages, rankings, pass/fail, and Excel export use official students only.
      </p>

      {loading ? (
        <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
          <CircularProgress sx={adminLoadingSpinnerSx} />
        </Box>
      ) : (
        <TableContainer sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Student</TableCell>
                <TableCell>Project</TableCell>
                <TableCell>Attempt</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Score</TableCell>
                <TableCell>Result</TableCell>
                <TableCell>Submitted</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data?.rows || []).map((row) => (
                <TableRow key={row.attemptId}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <span>{row.studentName}</span>
                      {row.demoBadge ? (
                        <Chip size="small" color="warning" label={row.demoBadge.label} />
                      ) : null}
                    </div>
                    <div className="text-xs opacity-70">{row.studentNumber || row.studentEmail}</div>
                  </TableCell>
                  <TableCell>{row.projectName}</TableCell>
                  <TableCell>#{row.attemptNumber}</TableCell>
                  <TableCell>{row.grade?.statusLabel || row.attemptStatus}</TableCell>
                  <TableCell>
                    {row.grade?.finalPercent != null
                      ? `${row.grade.finalScore} (${row.grade.finalPercent}%)`
                      : row.grade
                        ? `Auto ${row.grade.autoScore}`
                        : "—"}
                  </TableCell>
                  <TableCell>{row.grade?.passFailLabel || "—"}</TableCell>
                  <TableCell>{fmtDate(row.submittedAt)}</TableCell>
                  <TableCell align="right">
                    <div className="flex flex-nowrap justify-end gap-0.5">
                      <Tooltip title="Recalculate automatic score">
                        <IconButton
                          color="primary"
                          size="small"
                          aria-label="Recalculate automatic score"
                          className="cursor-pointer"
                          onClick={() => void recalculate(row)}
                        >
                          <RefreshRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Enter manual grade">
                        <IconButton
                          color="primary"
                          size="small"
                          aria-label="Enter manual grade"
                          className="cursor-pointer"
                          onClick={() => {
                            setGradeRow(row);
                            setManualScore(
                              row.grade?.manualScore != null
                                ? String(row.grade.manualScore)
                                : "",
                            );
                            setFeedback(row.grade?.feedback || "");
                            setFieldErrors({});
                          }}
                        >
                          <GradeRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(data?.rows || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>No attempts for this filter.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {stats?.rankings?.length ? (
        <div className="mt-6">
          <h2 className={BRAND_SECTION_TITLE_CLASS}>Official ranking (students only)</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {stats.rankings.slice(0, 20).map((r) => (
              <li key={`${r.studentUserId}-${r.attemptNumber}-${r.rank}`}>
                {r.studentName} — {r.finalPercent}% ({r.passFail}) · {r.projectName}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <Dialog
        open={Boolean(gradeRow)}
        onClose={() => !gradeBusy && setGradeRow(null)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: adminDialogPaperSx }}
      >
        <DialogTitle>Manual grade</DialogTitle>
        <DialogContent className="space-y-3 pt-2">
          <p className="text-sm opacity-80">
            {gradeRow?.studentName} · {gradeRow?.projectName} · Attempt #{gradeRow?.attemptNumber}
            {gradeRow?.demoBadge ? " · Demo (not in official stats)" : ""}
          </p>
          <p className="text-sm">
            Auto score: {gradeRow?.grade?.autoScore ?? 0}. Final = auto + manual (capped).
          </p>
          <TextField
            fullWidth
            label="Manual marks"
            value={manualScore}
            onChange={(e) => setManualScore(e.target.value)}
            error={Boolean(fieldErrors.manualScore)}
            helperText={fieldErrors.manualScore || ""}
            sx={themedTextFieldSx}
          />
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            sx={themedTextFieldSx}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setGradeRow(null)}
            disabled={gradeBusy}
            className="cursor-pointer disabled:cursor-not-allowed"
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void saveGrade()}
            disabled={gradeBusy}
            className={`${BRAND_BTN_PRIMARY_CLASS} cursor-pointer disabled:cursor-not-allowed`}
            startIcon={gradeBusy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {gradeBusy ? "Saving…" : "Save grade"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
