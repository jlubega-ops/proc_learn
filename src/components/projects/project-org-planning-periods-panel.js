"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { format, parseISO } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableRefetchOverlaySx,
  adminTableSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { formatPlanningPeriodDuration } from "@/lib/planning-period-duration";
import { parseDateInputValue } from "@/lib/financial-year-dates";
import {
  calendarDateInputConstraints,
  mergeCalendarDateRangeErrors,
} from "@/lib/validation/date-range";
import {
  validateProjectOrgPlanningPeriodInput,
  validateProjectOrgPlanningPeriodPatch,
} from "@/lib/validation/project-org-planning-period";

function emptyForm() {
  return { financialYearId: "", startDate: "", endDate: "" };
}

/**
 * @param {unknown} value
 */
function fmtTableDate(value) {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy");
}

/**
 * @param {ReturnType<typeof emptyForm>} form
 */
function computePeriodLabel(form) {
  const start = parseDateInputValue(form.startDate);
  const end = parseDateInputValue(form.endDate);
  if (!start || !end) return "—";
  return formatPlanningPeriodDuration(start, end);
}

/**
 * @param {{ projectId: string }} p
 */
export function ProjectOrgPlanningPeriodsPanel({ projectId, readOnly = false }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState(/** @type {any[]} */ ([]));
  const [activeFinancialYears, setActiveFinancialYears] = useState(
    /** @type {{ id: string; label: string }[]} */ ([]),
  );
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);

  const [openCreate, setOpenCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm());
  const [createErrors, setCreateErrors] = useState(/** @type {Record<string, string>} */ ({}));

  const [editRow, setEditRow] = useState(/** @type {any} */ (null));
  const [editForm, setEditForm] = useState(emptyForm());
  const [editErrors, setEditErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [editBusy, setEditBusy] = useState(false);

  const [delRow, setDelRow] = useState(/** @type {any} */ (null));
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(
    async (opts = /** @type {{ silent?: boolean }} */ ({})) => {
      const silent = Boolean(opts.silent);
      if (silent) setRefetching(true);
      else setLoading(true);
      try {
        const qp = new URLSearchParams({
          page: String(page + 1),
          pageSize: String(rowsPerPage),
        });
        const res = await fetch(
          `/api/projects/${projectId}/org-planning-periods?${qp.toString()}`,
          { credentials: "include" },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast({
            message:
              typeof data.error === "string" ? data.error : "Could not load planning periods.",
            severity: "error",
          });
          return;
        }
        setRows(Array.isArray(data.planningPeriods) ? data.planningPeriods : []);
        setActiveFinancialYears(
          Array.isArray(data.activeFinancialYears) ? data.activeFinancialYears : [],
        );
        setTotal(Number(data.total) || 0);
      } finally {
        if (silent) setRefetching(false);
        else setLoading(false);
      }
    },
    [page, projectId, rowsPerPage, showToast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function createPlanningPeriod() {
    const validated = validateProjectOrgPlanningPeriodInput(createForm);
    if (!validated.ok) {
      setCreateErrors(validated.errors);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }

    setCreateBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/org-planning-periods`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setCreateErrors(data.fieldErrors);
        showToast({
          message:
            typeof data.error === "string" ? data.error : "Could not create planning period.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Planning period created.", severity: "success" });
      setOpenCreate(false);
      setCreateForm(emptyForm());
      setCreateErrors({});
      await load({ silent: true });
    } finally {
      setCreateBusy(false);
    }
  }

  function openEdit(row) {
    setEditRow(row);
    setEditForm({
      financialYearId: row.financialYearId || "",
      startDate: row.startDate || "",
      endDate: row.endDate || "",
    });
    setEditErrors({});
  }

  async function saveEdit() {
    if (!editRow) return;
    const validated = validateProjectOrgPlanningPeriodPatch(editForm, {
      current: {
        financialYearId: editRow.financialYearId,
        startDate: parseDateInputValue(editRow.startDate) || new Date(editRow.startDate),
        endDate: parseDateInputValue(editRow.endDate) || new Date(editRow.endDate),
      },
    });
    if (!validated.ok) {
      setEditErrors(validated.errors);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }

    setEditBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/org-planning-periods/${editRow.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editForm),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setEditErrors(data.fieldErrors);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save changes.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Planning period updated.", severity: "success" });
      setEditRow(null);
      await load({ silent: true });
    } finally {
      setEditBusy(false);
    }
  }

  async function deletePlanningPeriod() {
    if (!delRow) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/org-planning-periods/${delRow.id}`,
        { method: "DELETE", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not delete.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Planning period deleted.", severity: "success" });
      setDelRow(null);
      await load({ silent: true });
    } finally {
      setDeleteBusy(false);
    }
  }

  const canAdd = activeFinancialYears.length > 0;

  if (loading) {
    return (
      <Box
        sx={adminCenteredLoadingBoxSx}
        aria-busy="true"
        aria-label="Loading planning periods"
      >
        <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {!readOnly ? (
          <Button
            variant="contained"
            startIcon={<AddRounded />}
            disabled={refetching || !canAdd}
            onClick={() => {
              setCreateErrors({});
              setCreateForm({
                ...emptyForm(),
                financialYearId: activeFinancialYears[0]?.id || "",
              });
              setOpenCreate(true);
            }}
            className="w-full sm:w-auto"
            title="Add planning period"
          >
            Add planning period
          </Button>
        ) : null}
        <Button
          variant="outlined"
          startIcon={refetching ? <CircularProgress size={16} /> : <RefreshRounded />}
          disabled={refetching}
          onClick={() => load({ silent: true })}
          className="w-full sm:w-auto"
          title="Refresh planning periods"
        >
          Refresh
        </Button>
      </div>

      {!canAdd ? (
        <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
          Create and activate at least one financial year before adding a planning period.
        </Typography>
      ) : (
        <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
          Choose an active financial year and a date range. The planning period length is calculated
          automatically and cannot be edited.
        </Typography>
      )}

      <Box sx={{ position: "relative" }}>
        <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Financial year</TableCell>
                <TableCell>Planning period</TableCell>
                <TableCell>Start</TableCell>
                <TableCell>End</TableCell>
                {!readOnly ? <TableCell align="right">Actions</TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={readOnly ? 4 : 5} align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" sx={adminMutedTextSx}>
                      No planning periods yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>{row.financialYear?.label || "—"}</TableCell>
                    <TableCell>{row.periodLabel || "—"}</TableCell>
                    <TableCell>{fmtTableDate(row.startDate)}</TableCell>
                    <TableCell>{fmtTableDate(row.endDate)}</TableCell>
                    {!readOnly ? (
                      <TableCell align="right">
                        <Box sx={{ display: "inline-flex", gap: 0.25 }}>
                          <Tooltip title="Edit planning period">
                            <IconButton
                              size="small"
                              aria-label="Edit planning period"
                              color="primary"
                              disabled={refetching}
                              onClick={() => openEdit(row)}
                            >
                              <EditRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete planning period">
                            <IconButton
                              size="small"
                              aria-label="Delete planning period"
                              color="error"
                              disabled={refetching}
                              onClick={() => setDelRow(row)}
                            >
                              <DeleteOutlineRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
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
          <Box
            sx={adminTableRefetchOverlaySx}
            aria-busy="true"
            aria-label="Updating planning periods"
          >
            <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
          </Box>
        ) : null}
      </Box>

      <PlanningPeriodFormDialog
        title="New planning period"
        open={openCreate}
        busy={createBusy}
        form={createForm}
        errors={createErrors}
        financialYears={activeFinancialYears}
        onClose={() => {
          if (createBusy) return;
          setOpenCreate(false);
          setCreateErrors({});
        }}
        onChange={(patch) => {
          setCreateForm((prev) => {
            const next = { ...prev, ...patch };
            if (patch.startDate !== undefined || patch.endDate !== undefined) {
              setCreateErrors((errs) =>
                mergeCalendarDateRangeErrors(errs, next.startDate, next.endDate),
              );
            }
            return next;
          });
        }}
        onClearError={(key) =>
          setCreateErrors((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          })
        }
        onSubmit={() => void createPlanningPeriod()}
      />

      <PlanningPeriodFormDialog
        title="Edit planning period"
        open={Boolean(editRow)}
        busy={editBusy}
        form={editForm}
        errors={editErrors}
        financialYears={activeFinancialYears}
        onClose={() => {
          if (editBusy) return;
          setEditRow(null);
          setEditErrors({});
        }}
        onChange={(patch) => {
          setEditForm((prev) => {
            const next = { ...prev, ...patch };
            if (patch.startDate !== undefined || patch.endDate !== undefined) {
              setEditErrors((errs) =>
                mergeCalendarDateRangeErrors(errs, next.startDate, next.endDate),
              );
            }
            return next;
          });
        }}
        onClearError={(key) =>
          setEditErrors((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          })
        }
        onSubmit={() => void saveEdit()}
      />

      <Dialog
        open={Boolean(delRow)}
        onClose={() => !deleteBusy && setDelRow(null)}
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Delete this planning period?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This removes the planning period from this project. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelRow(null)} disabled={deleteBusy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void deletePlanningPeriod()}
            disabled={deleteBusy}
          >
            {deleteBusy ? (
              <CircularProgress size={22} color="inherit" aria-hidden />
            ) : (
              "Delete"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/**
 * @param {{
 *   title: string;
 *   open: boolean;
 *   busy: boolean;
 *   form: ReturnType<typeof emptyForm>;
 *   errors: Record<string, string>;
 *   financialYears: { id: string; label: string }[];
 *   onClose: () => void;
 *   onChange: (patch: Partial<ReturnType<typeof emptyForm>>) => void;
 *   onClearError: (key: string) => void;
 *   onSubmit: () => void;
 * }} p
 */
function PlanningPeriodFormDialog({
  title,
  open,
  busy,
  form,
  errors,
  financialYears,
  onClose,
  onChange,
  onClearError,
  onSubmit,
}) {
  const periodLabel = useMemo(() => computePeriodLabel(form), [form]);
  const dateConstraints = calendarDateInputConstraints(form.startDate, form.endDate);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: adminDialogPaperSx } }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent className="pt-2">
        <Box
          component="form"
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <FormControl
            fullWidth
            error={Boolean(errors.financialYearId)}
            sx={{
              ...themedTextFieldSx,
              "& .MuiInputLabel-root":
                themedTextFieldSx["& .MuiInputLabel-root"],
            }}
          >
            <InputLabel id="planning-period-fy-label">Financial year</InputLabel>
            <Select
              labelId="planning-period-fy-label"
              label="Financial year"
              value={form.financialYearId}
              onChange={(e) => {
                onChange({ financialYearId: String(e.target.value) });
                onClearError("financialYearId");
              }}
            >
              {financialYears.map((fy) => (
                <MenuItem key={fy.id} value={fy.id}>
                  {fy.label}
                </MenuItem>
              ))}
            </Select>
            {errors.financialYearId ? (
              <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                {errors.financialYearId}
              </Typography>
            ) : null}
          </FormControl>

          <TextField
            label="Start date"
            type="date"
            value={form.startDate}
            onChange={(e) => {
              const startDate = e.target.value;
              onChange({ startDate });
              onClearError("financialYearId");
            }}
            error={Boolean(errors.startDate)}
            helperText={errors.startDate || " "}
            fullWidth
            slotProps={{
              inputLabel: { shrink: true },
              input: { max: dateConstraints.startMax },
            }}
            sx={themedTextFieldSx}
          />
          <TextField
            label="End date"
            type="date"
            value={form.endDate}
            onChange={(e) => {
              const endDate = e.target.value;
              onChange({ endDate });
            }}
            error={Boolean(errors.endDate)}
            helperText={errors.endDate || " "}
            fullWidth
            slotProps={{
              inputLabel: { shrink: true },
              input: { min: dateConstraints.endMin },
            }}
            sx={themedTextFieldSx}
          />
          <TextField
            label="Planning period"
            value={periodLabel}
            disabled
            fullWidth
            helperText="Calculated from the start and end dates."
            sx={themedTextFieldSx}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onSubmit} disabled={busy}>
          {busy ? <CircularProgress size={22} color="inherit" aria-hidden /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
