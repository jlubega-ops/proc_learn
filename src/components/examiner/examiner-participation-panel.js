"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
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
import { campusSelectOptions } from "@/lib/campuses";

/**
 * Examiner roster: students + personal organisation + current procurement stage.
 */
export function ExaminerParticipationPanel() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(/** @type {any} */ (null));
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [yearId, setYearId] = useState("");
  const [campus, setCampus] = useState("");
  const [participation, setParticipation] = useState("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set("q", search.trim());
      if (yearId) qs.set("academicYearId", yearId);
      if (campus) qs.set("campus", campus);
      qs.set("participation", participation);
      qs.set("page", String(page + 1));
      qs.set("pageSize", String(pageSize));
      const res = await fetch(`/api/examiner/observation/students?${qs}`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof json.error === "string" ? json.error : "Could not load participation.",
          severity: "error",
        });
        setData(null);
        return;
      }
      setData(json);
      if (!yearId && json?.academicYear?.id) setYearId(json.academicYear.id);
    } finally {
      setLoading(false);
    }
  }, [search, yearId, campus, participation, page, pageSize, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = data?.students || [];
  const total = data?.total ?? 0;

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title="Student participation"
        description="Each student has one organisation. Open a row to see where they are in procurement, who acted, and what remains — read-only."
      >
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            select
            size="small"
            label="Academic year"
            value={yearId}
            onChange={(e) => {
              setYearId(e.target.value);
              setPage(0);
            }}
            sx={themedTextFieldSx}
          >
            {(data?.availableYears || []).map((y) => (
              <MenuItem key={y.id} value={y.id}>
                {y.label}
                {y.isCurrent ? " (current)" : ""}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Campus"
            value={campus}
            onChange={(e) => {
              setCampus(e.target.value);
              setPage(0);
            }}
            sx={themedTextFieldSx}
          >
            <MenuItem value="">All campuses</MenuItem>
            {campusSelectOptions().map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Participants"
            value={participation}
            onChange={(e) => {
              setParticipation(e.target.value);
              setPage(0);
            }}
            sx={themedTextFieldSx}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="students">Students only</MenuItem>
            <MenuItem value="demo">Demo only</MenuItem>
          </TextField>
          <TextField
            size="small"
            label="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setSearch(q);
                setPage(0);
              }
            }}
            sx={themedTextFieldSx}
            placeholder="Name, email, student number"
          />
        </div>
        <div className="mt-3">
          <Button
            type="button"
            variant="outlined"
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <RefreshRounded />}
            onClick={() => {
              setSearch(q);
              void load();
            }}
            disabled={loading}
            className="cursor-pointer disabled:cursor-not-allowed"
          >
            Refresh
          </Button>
        </div>
      </DashboardPageIntro>

      {loading && !data ? (
        <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
          <CircularProgress sx={adminLoadingSpinnerSx} />
          <Typography sx={{ mt: 2 }}>Loading participation…</Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Student</TableCell>
                <TableCell>Organisation</TableCell>
                <TableCell>Current stage</TableCell>
                <TableCell>Open task / player</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <p className={BRAND_PAGE_LEAD_CLASS}>
                      No students found for this academic year. Change the year filter or add
                      students first.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    hover
                    className="cursor-pointer"
                    onClick={() => router.push(`/students/${row.id}/observe`)}
                  >
                    <TableCell>
                      <div className="font-medium">{row.displayName}</div>
                      <div className="text-xs opacity-70">{row.email}</div>
                      {row.studentNumber ? (
                        <div className="text-xs opacity-70">{row.studentNumber}</div>
                      ) : null}
                      {row.campusLabel ? (
                        <div className="text-xs opacity-70">Campus: {row.campusLabel}</div>
                      ) : null}
                      {row.demoBadge ? (
                        <Chip size="small" color="warning" className="mt-1" label={row.demoBadge.label} />
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {row.organisation ? (
                        <>
                          <div className="font-medium">{row.organisation.name}</div>
                          <div className="text-xs opacity-70">{row.organisation.projectCode || "—"}</div>
                        </>
                      ) : (
                        <span className="opacity-70">No organisation yet</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.currentStageLabel ? (
                        <Chip
                          size="small"
                          color="info"
                          label={row.currentStageLabel}
                          title={
                            row.progressPercent != null ? `${row.progressPercent}% complete` : ""
                          }
                        />
                      ) : (
                        "—"
                      )}
                      {row.progressPercent != null ? (
                        <div className="mt-1 text-xs opacity-70">{row.progressPercent}%</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {row.openTask ? (
                        <>
                          <div>{row.openTask.title}</div>
                          <div className="text-xs opacity-70">
                            {[row.openTask.assignee, row.openTask.role].filter(Boolean).join(" · ") ||
                              "Unassigned"}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="Open organisation progress (read-only)">
                        <IconButton
                          size="small"
                          color="info"
                          component={Link}
                          href={`/students/${row.id}/observe`}
                          aria-label={`View ${row.displayName} organisation`}
                        >
                          <VisibilityRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_e, next) => setPage(next)}
            rowsPerPage={pageSize}
            onRowsPerPageChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </TableContainer>
      )}
    </div>
  );
}
