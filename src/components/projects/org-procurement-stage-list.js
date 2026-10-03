"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
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
import SearchRounded from "@mui/icons-material/SearchRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import { format, isValid, parseISO } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableRefetchOverlaySx,
  adminTableSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { clickableTableRowProps, stopRowClick } from "@/lib/projects/clickable-table-row";
import { formatMoneyUGX } from "@/lib/money";
import { PROCUREMENT_STAGE_PAGES } from "@/lib/projects/procurement-stage-pages";

const SUCCESS_STATUSES = new Set(["ACCEPTED", "PAID", "VERIFIED", "APPROVED_FOR_PAYMENT", "CLOSED", "COMPLETE", "ACTIVE", "SIGNED"]);
const ERROR_STATUSES = new Set(["REJECTED", "CANCELLED", "DISPUTED"]);
const PENDING_STATUSES = new Set(["DRAFT", "PENDING", "UNDER_REVIEW", "RECEIVED", "PARTIAL"]);

/** @param {string} status */
function statusChipColor(status) {
  if (SUCCESS_STATUSES.has(status)) return "success";
  if (ERROR_STATUSES.has(status)) return "error";
  if (PENDING_STATUSES.has(status)) return "warning";
  return "info";
}

/** @param {string} status */
function humanStatus(status) {
  const s = String(status || "").replace(/_/g, " ").toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : "—";
}

/** @param {string | null | undefined} value */
function shortDate(value) {
  if (!value) return null;
  const d = parseISO(String(value));
  return isValid(d) ? format(d, "MMM d, yyyy") : null;
}

/** @param {{ turn: string; message?: string | null }} p */
function TurnChip({ turn, message }) {
  if (turn === "YOURS") return <Chip size="small" color="primary" label="Your turn" />;
  if (turn === "OTHER_MODE") {
    return (
      <Tooltip title={message || "Switch role to act on this step."}>
        <Chip size="small" color="warning" label="Yours — switch role" />
      </Tooltip>
    );
  }
  if (turn === "DONE") return <Chip size="small" color="success" label="Workflow complete" />;
  return <Chip size="small" color="info" variant="outlined" label="Waiting on others" />;
}

/**
 * Paginated Procurements sub-page (review tasks, awards, contracts/LPO, deliveries,
 * invoices, payments, closures).
 * @param {{ projectId: string; stage: keyof typeof PROCUREMENT_STAGE_PAGES }} p
 */
export function OrgProcurementStageList({ projectId, stage }) {
  const router = useRouter();
  const { showToast } = useToast();
  const config = PROCUREMENT_STAGE_PAGES[stage];
  const isReview = stage === "review-tasks";

  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [denied, setDenied] = useState(false);
  const [rows, setRows] = useState(/** @type {any[]} */ ([]));
  const [total, setTotal] = useState(0);
  const [access, setAccess] = useState(/** @type {any} */ (null));
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [filter, setFilter] = useState(isReview ? "mine" : "all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(
    async (initial = false) => {
      if (initial) setLoading(true);
      else setRefetching(true);
      try {
        const qs = new URLSearchParams({
          page: String(page + 1),
          pageSize: String(rowsPerPage),
          filter,
        });
        if (search) qs.set("search", search);
        const res = await fetch(`/api/projects/${projectId}/procurement-stages/${stage}?${qs}`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 404) {
          setDenied(true);
          return;
        }
        if (!res.ok) {
          showToast({
            message: typeof data.error === "string" ? data.error : `Could not load ${config.label.toLowerCase()}.`,
            severity: "error",
          });
          return;
        }
        setDenied(false);
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setTotal(Number(data.total) || 0);
        setAccess(data.access || null);
      } catch {
        showToast({ message: "Network error. Please try again.", severity: "error" });
      } finally {
        setLoading(false);
        setRefetching(false);
      }
    },
    [projectId, stage, page, rowsPerPage, filter, search, showToast, config.label],
  );

  const loadedOnce = useRef(false);
  useEffect(() => {
    void load(!loadedOnce.current);
    loadedOnce.current = true;
  }, [load]);

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
        <CircularProgress sx={adminLoadingSpinnerSx} />
        <Typography sx={adminMutedTextSx}>Loading {config.label.toLowerCase()}…</Typography>
      </Box>
    );
  }

  if (denied) {
    return (
      <Alert severity="warning">
        {config.label} isn&apos;t part of your current role&apos;s work. If you hold another role or
        committee seat that works on this stage, switch to it first.
      </Alert>
    );
  }

  const filterOptions = isReview
    ? [
        { value: "mine", label: "Waiting for me" },
        { value: "pending", label: "All in progress" },
        { value: "all", label: "All procurements" },
      ]
    : [
        { value: "all", label: "All procurements" },
        { value: "recorded", label: config.recordedLabel },
        { value: "pending", label: config.pendingLabel },
        { value: "mine", label: "Waiting for me" },
      ];

  return (
    <div className="space-y-3">
      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <TextField
            label="Search"
            placeholder="PROC number or title"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            sx={{ ...themedTextFieldSx, minWidth: { sm: 260 } }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRounded fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            select
            label="Show"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
            sx={{ ...themedTextFieldSx, minWidth: { sm: 200 } }}
          >
            {filterOptions.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            startIcon={<RefreshRounded />}
            onClick={() => void load(false)}
            className="w-full sm:ml-auto sm:w-auto"
          >
            Refresh
          </Button>
        </div>
        {access && !access.act ? (
          <Typography variant="caption" sx={{ display: "block", mt: 1, color: "primary.main", fontWeight: 600 }}>
            View only — {access.reason}
          </Typography>
        ) : null}
      </Paper>

      <Box sx={{ position: "relative" }}>
        <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Procurement</TableCell>
                {isReview ? null : <TableCell>{config.label}</TableCell>}
                {isReview ? null : <TableCell>Status</TableCell>}
                <TableCell>Workflow stage</TableCell>
                <TableCell>Your part</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isReview ? 4 : 6}>
                    <Typography sx={adminMutedTextSx}>
                      {filter === "mine"
                        ? "Nothing is waiting for you here right now."
                        : "No procurements match these filters."}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const href = `/projects/${projectId}/procurements/${r.id}`;
                  const wf = r.workflow;
                  const rec = r.record;
                  return (
                    <TableRow key={r.id} {...clickableTableRowProps({ href, router })}>
                      <TableCell sx={{ minWidth: 200 }}>
                        <span className="font-semibold">{r.procurementNumber}</span>
                        <div className="text-xs opacity-80">{r.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <Chip size="small" color="info" variant="outlined" label={r.procurementMethod} />
                          {r.department ? <span className="text-xs opacity-70">{r.department}</span> : null}
                        </div>
                      </TableCell>
                      {isReview ? null : (
                        <TableCell sx={{ minWidth: 180 }}>
                          {rec ? (
                            <>
                              {rec.kind ? <div className="text-xs font-semibold">{rec.kind}</div> : null}
                              <div className="text-sm">{rec.reference}</div>
                              <div className="text-xs opacity-70">
                                {[rec.amount != null ? formatMoneyUGX(rec.amount) : null, shortDate(rec.date)]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            </>
                          ) : (
                            <span className="text-xs opacity-70">Nothing recorded yet</span>
                          )}
                        </TableCell>
                      )}
                      {isReview ? null : (
                        <TableCell>
                          {rec ? (
                            <>
                              <Chip size="small" color={statusChipColor(rec.status)} label={humanStatus(rec.status)} />
                              {rec.secondaryStatus ? (
                                <div className="mt-1 max-w-48 truncate text-xs opacity-80" title={rec.secondaryStatus}>
                                  {rec.secondaryStatus}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <Chip size="small" color="warning" variant="outlined" label="Not started" />
                          )}
                        </TableCell>
                      )}
                      <TableCell sx={{ minWidth: 220 }}>
                        {!wf ? (
                          <span className="text-xs opacity-70">No workflow started</span>
                        ) : wf.status === "COMPLETED" ? (
                          <span className="text-sm">All {wf.totalSteps} steps complete</span>
                        ) : (
                          <>
                            <div className="text-sm font-semibold">
                              Step {wf.currentStepNumber ?? "—"} of {wf.totalSteps}
                              {wf.currentStepLabel ? `: ${wf.currentStepLabel}` : ""}
                            </div>
                            {wf.waitingOnRole ? (
                              <div className="text-xs opacity-80">
                                Pending {wf.waitingOnRole}
                                {wf.waitingOnPeople?.length ? ` (${wf.waitingOnPeople.join(", ")})` : ""}
                              </div>
                            ) : null}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <TurnChip turn={r.turn} message={r.turnMessage} />
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ whiteSpace: "nowrap" }}
                        onClick={stopRowClick}
                        onKeyDown={stopRowClick}
                      >
                        <Tooltip title="Open procurement">
                          <IconButton
                            component={Link}
                            href={href}
                            size="small"
                            color="primary"
                            aria-label={`Open ${r.procurementNumber}`}
                          >
                            <VisibilityRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_e, next) => setPage(next)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[5, 10, 20, 50]}
        />
        {refetching ? (
          <Box sx={adminTableRefetchOverlaySx} aria-busy="true">
            <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
          </Box>
        ) : null}
      </Box>
    </div>
  );
}
