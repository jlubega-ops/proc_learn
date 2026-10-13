"use client";

import { useCallback, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
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
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
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
  validateProjectOrgDepartmentInput,
  validateProjectOrgDepartmentPatch,
} from "@/lib/validation/project-org-department";

function emptyForm() {
  return { name: "", description: "", isActive: true };
}

/**
 * @param {{ projectId: string }} p
 */
export function ProjectOrgDepartmentsPanel({ projectId, readOnly = false }) {
  const { showToast } = useToast();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [expanded, setExpanded] = useState(/** @type {Record<string, boolean>} */ ({}));

  const [createDeptOpen, setCreateDeptOpen] = useState(false);
  const [createDeptBusy, setCreateDeptBusy] = useState(false);
  const [createDeptForm, setCreateDeptForm, createDeptDraft] = useDraftState(
    `org:department:${projectId}:new`,
    emptyForm(),
    { enabled: createDeptOpen },
  );
  const [createDeptErrors, setCreateDeptErrors] = useState(/** @type {Record<string, string>} */ ({}));

  const [subunitParent, setSubunitParent] = useState(/** @type {any} */ (null));
  const [createSubBusy, setCreateSubBusy] = useState(false);
  const [createSubForm, setCreateSubForm, createSubDraft] = useDraftState(
    `org:department:${projectId}:${subunitParent?.id || ""}:new-subunit`,
    emptyForm(),
    { enabled: Boolean(subunitParent), resetKey: subunitParent?.id ?? null },
  );
  const [createSubErrors, setCreateSubErrors] = useState(/** @type {Record<string, string>} */ ({}));

  const [editRow, setEditRow] = useState(/** @type {any} */ (null));
  const [editForm, setEditForm, editDraft] = useDraftState(
    `org:department:${projectId}:edit:${editRow?.id || ""}`,
    editRow
      ? { name: editRow.name || "", description: editRow.description || "", isActive: editRow.isActive !== false }
      : emptyForm(),
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
  } = useApi(`/api/projects/${projectId}/org-departments?${listQuery.toString()}`, {
    errorMessage: "Could not load departments.",
  });
  const rows = Array.isArray(listData?.departments) ? listData.departments : [];
  const total = Number(listData?.total) || 0;
  const load = useCallback(async () => {
    await reload();
    void revalidateApi(`/api/projects/${projectId}/org-departments`);
  }, [projectId, reload]);

  async function toggleActive(row) {
    setPatchingId(row.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/org-departments/${row.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      });
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

  async function createDepartment(parentId = null) {
    const form = parentId ? createSubForm : createDeptForm;
    const payload = { ...form, parentId, parentDepartmentId: parentId };
    const validated = validateProjectOrgDepartmentInput(payload);
    if (!validated.ok) {
      if (parentId) setCreateSubErrors(validated.errors);
      else setCreateDeptErrors(validated.errors);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }

    if (parentId) setCreateSubBusy(true);
    else setCreateDeptBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/org-departments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated.data),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) {
          if (parentId) setCreateSubErrors(data.fieldErrors);
          else setCreateDeptErrors(data.fieldErrors);
        }
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not create department.",
          severity: "error",
        });
        return;
      }
      showToast({
        message: parentId ? "Subunit created." : "Department created.",
        severity: "success",
      });
      if (parentId) {
        createSubDraft.resetForm(emptyForm());
        setSubunitParent(null);
        setCreateSubErrors({});
        setExpanded((p) => ({ ...p, [parentId]: true }));
      } else {
        setCreateDeptOpen(false);
        createDeptDraft.resetForm(emptyForm());
        setCreateDeptErrors({});
      }
      await load({ silent: true });
    } finally {
      if (parentId) setCreateSubBusy(false);
      else setCreateDeptBusy(false);
    }
  }

  function openEdit(row) {
    setEditRow(row);
    setEditErrors({});
  }

  async function saveEdit() {
    if (!editRow) return;
    const validated = validateProjectOrgDepartmentPatch(editForm);
    if (!validated.ok) {
      setEditErrors(validated.errors);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setEditBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/org-departments/${editRow.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated.data),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setEditErrors(data.fieldErrors);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save changes.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Saved.", severity: "success" });
      editDraft.clearDraft();
      setEditRow(null);
      await load({ silent: true });
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteDepartment() {
    if (!delRow) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/org-departments/${delRow.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!deleteSucceeded(res)) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not delete.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Deleted.", severity: "success" });
      setDelRow(null);
      await load({ silent: true });
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy="true" aria-label="Loading departments">
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
              setCreateDeptErrors({});
              setCreateDeptOpen(true);
            }}
            className="w-full sm:w-auto"
          >
            Add department
          </Button>
        ) : null}
        <Button
          variant="outlined"
          startIcon={refetching ? <CircularProgress size={16} /> : <RefreshRounded />}
          disabled={refetching}
          onClick={() => load({ silent: true })}
          className="w-full sm:w-auto"
        >
          Refresh
        </Button>
      </div>

      <Box sx={{ position: "relative" }}>
        <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Active</TableCell>
                {!readOnly ? <TableCell align="right">Actions</TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={readOnly ? 3 : 4} align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" sx={adminMutedTextSx}>
                      No departments yet. Add a department, then create subunits inside it.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.flatMap((dept) => {
                  const isOpen = expanded[dept.id] !== false;
                  const subunits = Array.isArray(dept.subunits) ? dept.subunits : [];
                  return [
                    <TableRow key={dept.id}>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <IconButton
                            size="small"
                            aria-label={isOpen ? "Collapse subunits" : "Expand subunits"}
                            onClick={() => setExpanded((p) => ({ ...p, [dept.id]: !isOpen }))}
                          >
                            {isOpen ? (
                              <ExpandLessRounded fontSize="small" />
                            ) : (
                              <ExpandMoreRounded fontSize="small" />
                            )}
                          </IconButton>
                          <span className="font-medium">{dept.name}</span>
                        </Box>
                      </TableCell>
                      <TableCell>{dept.description || "—"}</TableCell>
                      <TableCell>
                        {readOnly ? (
                          <span className="text-sm">{dept.isActive ? "Yes" : "No"}</span>
                        ) : (
                          <Switch
                            checked={dept.isActive}
                            onChange={() => void toggleActive(dept)}
                            disabled={patchingId === dept.id || refetching}
                          />
                        )}
                      </TableCell>
                      {!readOnly ? (
                        <TableCell align="right">
                          <RowActions
                            refetching={refetching}
                            onEdit={() => openEdit(dept)}
                            onDelete={() => setDelRow(dept)}
                            onAddSubunit={() => {
                              setCreateSubErrors({});
                              setSubunitParent(dept);
                            }}
                            showAddSubunit
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>,
                    ...(isOpen
                      ? subunits.map((sub) => (
                          <TableRow key={sub.id} sx={{ bgcolor: "action.hover" }}>
                            <TableCell sx={{ pl: 6 }}>{sub.name}</TableCell>
                            <TableCell>{sub.description || "—"}</TableCell>
                            <TableCell>
                              {readOnly ? (
                                <span className="text-sm">{sub.isActive ? "Yes" : "No"}</span>
                              ) : (
                                <Switch
                                  checked={sub.isActive}
                                  onChange={() => void toggleActive(sub)}
                                  disabled={patchingId === sub.id || refetching}
                                />
                              )}
                            </TableCell>
                            {!readOnly ? (
                              <TableCell align="right">
                                <RowActions
                                  refetching={refetching}
                                  onEdit={() => openEdit(sub)}
                                  onDelete={() => setDelRow(sub)}
                                />
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))
                      : []),
                  ];
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

      <DeptFormDialog
        title="New department"
        open={createDeptOpen}
        busy={createDeptBusy}
        form={createDeptForm}
        errors={createDeptErrors}
        onClose={() => {
          if (createDeptBusy) return;
          createDeptDraft.resetForm(emptyForm());
          setCreateDeptOpen(false);
        }}
        onChange={(patch) => setCreateDeptForm((p) => ({ ...p, ...patch }))}
        onClearError={(key) =>
          setCreateDeptErrors((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          })
        }
        onSubmit={() => void createDepartment(null)}
      />

      <DeptFormDialog
        title={`New subunit in ${subunitParent?.name || "department"}`}
        open={Boolean(subunitParent)}
        busy={createSubBusy}
        form={createSubForm}
        errors={createSubErrors}
        onClose={() => {
          if (createSubBusy) return;
          createSubDraft.clearDraft();
          setSubunitParent(null);
        }}
        onChange={(patch) => setCreateSubForm((p) => ({ ...p, ...patch }))}
        onClearError={(key) =>
          setCreateSubErrors((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          })
        }
        onSubmit={() => void createDepartment(subunitParent?.id)}
      />

      <DeptFormDialog
        title="Edit"
        open={Boolean(editRow)}
        busy={editBusy}
        form={editForm}
        errors={editErrors}
        onClose={() => {
          if (editBusy) return;
          editDraft.clearDraft();
          setEditRow(null);
        }}
        onChange={(patch) => setEditForm((p) => ({ ...p, ...patch }))}
        onClearError={(key) =>
          setEditErrors((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          })
        }
        onSubmit={() => void saveEdit()}
        showActiveToggle
      />

      <Dialog
        open={Boolean(delRow)}
        onClose={() => !deleteBusy && setDelRow(null)}
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Delete {delRow?.name}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This removes the {delRow?.parentId ? "subunit" : "department"} from this project. Users must be
            reassigned first.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelRow(null)} disabled={deleteBusy}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={() => void deleteDepartment()} disabled={deleteBusy}>
            {deleteBusy ? <CircularProgress size={22} color="inherit" aria-hidden /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function RowActions({ refetching, onEdit, onDelete, onAddSubunit, showAddSubunit = false }) {
  return (
    <Box sx={{ display: "inline-flex", gap: 0.25 }}>
      {showAddSubunit ? (
        <Tooltip title="Add subunit">
          <IconButton size="small" aria-label="Add subunit" disabled={refetching} onClick={onAddSubunit}>
            <AddRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}
      <Tooltip title="Edit">
        <IconButton size="small" aria-label="Edit" disabled={refetching} onClick={onEdit} color="primary">
          <EditRounded fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete">
        <IconButton size="small" aria-label="Delete" disabled={refetching} onClick={onDelete} color="error">
          <DeleteOutlineRounded fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function DeptFormDialog({
  title,
  open,
  busy,
  form,
  errors,
  onClose,
  onChange,
  onClearError,
  onSubmit,
  showActiveToggle = false,
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { sx: adminDialogPaperSx } }}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent className="pt-2">
        <Box component="form" noValidate className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => {
              onChange({ name: e.target.value });
              onClearError("name");
            }}
            error={Boolean(errors.name)}
            helperText={errors.name}
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
            helperText={errors.description}
            fullWidth
            multiline
            minRows={2}
            sx={themedTextFieldSx}
          />
          {showActiveToggle ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Switch
                checked={form.isActive}
                onChange={(e) => onChange({ isActive: e.target.checked })}
              />
              <Typography variant="body2">Active</Typography>
            </Box>
          ) : null}
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
