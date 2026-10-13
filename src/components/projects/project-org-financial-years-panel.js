"use client";

import { useCallback, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Switch from "@mui/material/Switch";
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
import { addDays, format, parseISO } from "date-fns";
import { discardConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useDraftState } from "@/hooks/use-draft-state";
import { useApi } from "@/hooks/use-api";
import { deleteSucceeded, revalidateApi } from "@/lib/api-client-cache";
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
import {
  fiscalYearEndFromStart,
  parseDateInputValue,
  suggestFinancialYearLabel,
  toDateInputValue,
} from "@/lib/financial-year-dates";
import {
  validateProjectOrgFinancialYearInput,
  validateProjectOrgFinancialYearPatch,
} from "@/lib/validation/project-org-financial-year";

function emptyForm() {
  return {
    label: "",
    description: "",
    startDate: "",
    endDate: "",
    isActive: true,
  };
}

/** @param {any} row */
function formFromRow(row) {
  return {
    label: row.label || "",
    description: row.description || "",
    startDate: row.startDate || "",
    endDate: row.endDate || "",
    isActive: row.isActive !== false,
  };
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
 * @param {Partial<ReturnType<typeof emptyForm>>} patch
 */
function applyStartDateDefaults(form, patch) {
  const next = { ...form, ...patch };
  if (patch.startDate === undefined) return next;
  const start = parseDateInputValue(patch.startDate);
  if (!start) {
    return { ...next, endDate: "" };
  }
  const end = fiscalYearEndFromStart(start);
  return {
    ...next,
    endDate: toDateInputValue(end),
    label: suggestFinancialYearLabel(start),
  };
}

/**
 * @param {{ projectId: string }} p
 */
export function ProjectOrgFinancialYearsPanel({ projectId, readOnly = false }) {
  const { showToast } = useToast();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [openCreate, setOpenCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const confirm = useConfirm();
  const [createForm, setCreateForm, createDraft] = useDraftState(
    `org:financial-year:${projectId}:new`,
    emptyForm(),
    { enabled: openCreate },
  );
  const [createErrors, setCreateErrors] = useState(/** @type {Record<string, string>} */ ({}));

  const [editRow, setEditRow] = useState(/** @type {any} */ (null));
  const [editForm, setEditForm, editDraft] = useDraftState(
    `org:financial-year:${projectId}:edit:${editRow?.id || ""}`,
    editRow ? formFromRow(editRow) : emptyForm(),
    { enabled: Boolean(editRow), resetKey: editRow?.id ?? null },
  );
  const [editErrors, setEditErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [editBusy, setEditBusy] = useState(false);

  const [delRow, setDelRow] = useState(/** @type {any} */ (null));
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [patchingId, setPatchingId] = useState("");

  const listQuery = new URLSearchParams({ page: String(page + 1), pageSize: String(rowsPerPage) });
  const {
    data: listData,
    loading,
    refreshing: refetching,
    reload,
  } = useApi(`/api/projects/${projectId}/org-financial-years?${listQuery.toString()}`, {
    errorMessage: "Could not load financial years.",
  });
  const rows = Array.isArray(listData?.financialYears) ? listData.financialYears : [];
  const total = Number(listData?.total) || 0;
  const load = useCallback(async () => {
    await reload();
    void revalidateApi(`/api/projects/${projectId}/org-`);
  }, [projectId, reload]);

  async function toggleActive(row) {
    setPatchingId(row.id);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/org-financial-years/${row.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !row.isActive }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Update failed.",
          severity: "error",
        });
        return;
      }
      await load({ silent: true });
    } finally {
      setPatchingId("");
    }
  }

  async function createFinancialYear() {
    const validated = validateProjectOrgFinancialYearInput(createForm);
    if (!validated.ok) {
      setCreateErrors(validated.errors);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }

    setCreateBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/org-financial-years`, {
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
            typeof data.error === "string" ? data.error : "Could not create financial year.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Financial year created.", severity: "success" });
      setOpenCreate(false);
      createDraft.resetForm(emptyForm());
      setCreateErrors({});
      await load({ silent: true });
    } finally {
      setCreateBusy(false);
    }
  }

  function openEdit(row) {
    setEditRow(row);
    setEditErrors({});
  }

  async function closeCreate() {
    if (createBusy) return;
    if (createDraft.isDirty && !(await confirm(discardConfirmOptions()))) return;
    createDraft.resetForm(emptyForm());
    setOpenCreate(false);
    setCreateErrors({});
  }

  async function closeEdit() {
    if (editBusy) return;
    if (editDraft.isDirty && !(await confirm(discardConfirmOptions()))) return;
    editDraft.clearDraft();
    setEditRow(null);
    setEditErrors({});
  }

  async function saveEdit() {
    if (!editRow) return;
    const validated = validateProjectOrgFinancialYearPatch(editForm, {
      current: {
        label: editRow.label,
        description: editRow.description,
        startDate: parseDateInputValue(editRow.startDate) || new Date(editRow.startDate),
        endDate: parseDateInputValue(editRow.endDate) || new Date(editRow.endDate),
        isActive: editRow.isActive !== false,
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
        `/api/projects/${projectId}/org-financial-years/${editRow.id}`,
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
      showToast({ message: "Financial year updated.", severity: "success" });
      editDraft.clearDraft();
      setEditRow(null);
      await load({ silent: true });
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteFinancialYear() {
    if (!delRow) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/org-financial-years/${delRow.id}`,
        { method: "DELETE", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!deleteSucceeded(res)) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not delete.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Financial year deleted.", severity: "success" });
      setDelRow(null);
      await load({ silent: true });
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) {
    return (
      <Box
        sx={adminCenteredLoadingBoxSx}
        aria-busy="true"
        aria-label="Loading financial years"
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
            disabled={refetching}
            onClick={() => {
              setCreateErrors({});
              const latestEnd = parseDateInputValue(listData?.latestEndDate);
              if (latestEnd && !createForm.startDate) {
                setCreateForm((prev) =>
                  applyStartDateDefaults(prev, { startDate: toDateInputValue(addDays(latestEnd, 1)) }),
                );
              }
              setOpenCreate(true);
            }}
            className="w-full sm:w-auto"
            title="Add financial year"
          >
            Add financial year
          </Button>
        ) : null}
        <Button
          variant="outlined"
          startIcon={refetching ? <CircularProgress size={16} /> : <RefreshRounded />}
          disabled={refetching}
          onClick={() => load({ silent: true })}
          className="w-full sm:w-auto"
          title="Refresh financial years"
        >
          Refresh
        </Button>
      </div>

      <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
        One year each (e.g. Jul 1, 2026 – Jun 30, 2027 or Jan 1 – Dec 31, 2026). Years cannot
        overlap. Only one is active.
      </Typography>

      <Box sx={{ position: "relative" }}>
        <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Financial year</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Start</TableCell>
                <TableCell>End</TableCell>
                <TableCell>Status</TableCell>
                {!readOnly ? <TableCell align="right">Actions</TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={readOnly ? 5 : 6} align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" sx={adminMutedTextSx}>
                      No financial years yet. Add one to define the organisation&apos;s active
                      period.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>{row.label}</TableCell>
                    <TableCell>{row.description || "—"}</TableCell>
                    <TableCell>{fmtTableDate(row.startDate)}</TableCell>
                    <TableCell>{fmtTableDate(row.endDate)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={row.isActive ? "Active" : "Inactive"}
                        color={row.isActive ? "success" : "warning"}
                        sx={{ height: 22 }}
                      />
                    </TableCell>
                    {!readOnly ? (
                      <TableCell align="right">
                        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>
                          <Tooltip
                            title={
                              row.isActive
                                ? "Deactivate financial year"
                                : "Set as active financial year"
                            }
                          >
                            <Switch
                              size="small"
                              checked={Boolean(row.isActive)}
                              disabled={refetching || patchingId === row.id}
                              onChange={() => void toggleActive(row)}
                              slotProps={{
                                input: {
                                  "aria-label": row.isActive
                                    ? "Deactivate financial year"
                                    : "Set as active financial year",
                                },
                              }}
                            />
                          </Tooltip>
                          <Tooltip title="Edit financial year">
                            <IconButton
                              size="small"
                              aria-label="Edit financial year"
                              color="primary"
                              disabled={refetching}
                              onClick={() => openEdit(row)}
                            >
                              <EditRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete financial year">
                            <IconButton
                              size="small"
                              aria-label="Delete financial year"
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
            aria-label="Updating financial years"
          >
            <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
          </Box>
        ) : null}
      </Box>

      <FinancialYearFormDialog
        title="New financial year"
        open={openCreate}
        busy={createBusy}
        form={createForm}
        errors={createErrors}
        onClose={() => void closeCreate()}
        onChange={(patch) => setCreateForm((prev) => applyStartDateDefaults(prev, patch))}
        onClearError={(key) =>
          setCreateErrors((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          })
        }
        onSubmit={() => void createFinancialYear()}
      />

      <FinancialYearFormDialog
        title="Edit financial year"
        open={Boolean(editRow)}
        busy={editBusy}
        form={editForm}
        errors={editErrors}
        onClose={() => void closeEdit()}
        onChange={(patch) => setEditForm((prev) => applyStartDateDefaults(prev, patch))}
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
        <DialogTitle>Delete {delRow?.label || "financial year"}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This removes the financial year from this project. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelRow(null)} disabled={deleteBusy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void deleteFinancialYear()}
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
 *   onClose: () => void;
 *   onChange: (patch: Partial<ReturnType<typeof emptyForm>>) => void;
 *   onClearError: (key: string) => void;
 *   onSubmit: () => void;
 * }} p
 */
function FinancialYearFormDialog({
  title,
  open,
  busy,
  form,
  errors,
  onClose,
  onChange,
  onClearError,
  onSubmit,
}) {
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
          <TextField
            label="Financial year"
            placeholder="2026-2027"
            value={form.label}
            onChange={(e) => {
              onChange({ label: e.target.value });
              onClearError("label");
            }}
            error={Boolean(errors.label)}
            helperText={errors.label || "YYYY-YYYY, or YYYY for Jan–Dec."}
            fullWidth
            sx={themedTextFieldSx}
          />
          <TextField
            label="Description"
            value={form.description}
            onChange={(e) => {
              onChange({ description: e.target.value });
              onClearError("description");
            }}
            error={Boolean(errors.description)}
            helperText={errors.description || " "}
            fullWidth
            multiline
            minRows={2}
            sx={themedTextFieldSx}
          />
          <TextField
            label="Start date"
            type="date"
            value={form.startDate}
            onChange={(e) => {
              onChange({ startDate: e.target.value });
              onClearError("startDate");
              onClearError("endDate");
              onClearError("label");
            }}
            error={Boolean(errors.startDate)}
            helperText={errors.startDate || " "}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
            sx={themedTextFieldSx}
          />
          <TextField
            label="End date"
            type="date"
            value={form.endDate}
            disabled
            error={Boolean(errors.endDate)}
            helperText={
              errors.endDate ||
              "Filled automatically — one day before the start-date anniversary."
            }
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
            sx={themedTextFieldSx}
          />
          <FormControlLabel
            control={
              <Switch
                checked={form.isActive}
                onChange={(e) => onChange({ isActive: e.target.checked })}
              />
            }
            label="Active (only one financial year can be active at a time)"
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
