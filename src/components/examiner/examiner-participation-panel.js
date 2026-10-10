"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
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
import Typography from "@mui/material/Typography";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
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

const HIDE_BELOW_SM = { display: { xs: "none", sm: "table-cell" } };
const HIDE_BELOW_MD = { display: { xs: "none", md: "table-cell" } };
const HIDE_BELOW_LG = { display: { xs: "none", lg: "table-cell" } };

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
        description="Students and their organisations."
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
                <TableCell sx={HIDE_BELOW_MD}>Programme</TableCell>
                <TableCell sx={HIDE_BELOW_LG}>Campus</TableCell>
                <TableCell sx={HIDE_BELOW_SM}>Organisation</TableCell>
                <TableCell>Progress</TableCell>
                <TableCell sx={HIDE_BELOW_LG}>Work</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <p className={BRAND_PAGE_LEAD_CLASS}>No students found.</p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const open = () => router.push(`/students/${row.id}/observe`);
                  return (
                      <TableRow
                        key={row.id}
                        hover
                        title="Open student organisation"
                        tabIndex={0}
                        role="link"
                        aria-label={`Open ${row.displayName}`}
                        className="cursor-pointer"
                        onClick={open}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            open();
                          }
                        }}
                      >
                        <TableCell>
                          <div className="font-medium text-foreground">{row.displayName}</div>
                          <div className="break-all text-xs opacity-70">{row.email}</div>
                          <div className="text-xs opacity-70">
                            {[row.studentNumber, row.registrationNumber].filter(Boolean).join(" · ")}
                          </div>
                          {row.demoBadge ? (
                            <Chip size="small" color="warning" className="mt-1" label={row.demoBadge.label} />
                          ) : null}
                        </TableCell>
                        <TableCell sx={HIDE_BELOW_MD}>
                          <div>{row.programmeShortName || row.programmeName || "—"}</div>
                          <div className="text-xs opacity-70">
                            {[row.yearOfStudy ? `Year ${row.yearOfStudy}` : null, row.academicYearLabel]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </TableCell>
                        <TableCell sx={HIDE_BELOW_LG}>{row.campusLabel || "—"}</TableCell>
                        <TableCell sx={HIDE_BELOW_SM}>
                          {row.organisation ? (
                            <>
                              <div className="font-medium">
                                {row.organisation.displayName || row.organisation.name}
                              </div>
                              <div className="text-xs opacity-70">{row.organisation.projectCode || "—"}</div>
                            </>
                          ) : (
                            <span className="opacity-70">No organisation yet</span>
                          )}
                        </TableCell>
                        <TableCell sx={{ minWidth: 140 }}>
                          {row.currentStageLabel ? (
                            <Chip
                              size="small"
                              color={row.progressPercent >= 100 ? "success" : row.progressPercent > 0 ? "info" : "warning"}
                              variant={row.progressPercent > 0 ? "filled" : "outlined"}
                              label={row.currentStageLabel}
                            />
                          ) : (
                            "—"
                          )}
                          {row.progressPercent != null ? (
                            <div className="mt-1 flex items-center gap-2">
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(100, Math.max(0, row.progressPercent))}
                                sx={{ flex: 1, height: 6, borderRadius: 3 }}
                                aria-label={`${row.progressPercent}% complete`}
                              />
                              <span className="text-xs tabular-nums opacity-70">{row.progressPercent}%</span>
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell sx={HIDE_BELOW_LG}>
                          {row.counts ? (
                            <div className="text-xs leading-5">
                              <div>
                                {row.counts.procurements} procurement{row.counts.procurements === 1 ? "" : "s"}
                              </div>
                              <div className="opacity-70">
                                {row.counts.requisitions} req · {row.counts.plans} plans · {row.counts.budgets} budgets
                              </div>
                            </div>
                          ) : (
                            "—"
                          )}
                          <div className="text-xs opacity-70">
                            Last sign-in: {row.lastLoginAt ? format(new Date(row.lastLoginAt), "MMM d, yyyy") : "Never"}
                          </div>
                        </TableCell>
                      </TableRow>
                  );
                })
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
