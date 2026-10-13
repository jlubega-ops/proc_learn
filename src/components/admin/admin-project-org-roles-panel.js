"use client";

import { useCallback, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import AddRounded from "@mui/icons-material/AddRounded";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import Chip from "@mui/material/Chip";
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
import { useToast } from "@/components/providers/toast-provider";
import { useDraftSync } from "@/hooks/use-draft-sync";
import { useApi } from "@/hooks/use-api";
import { deleteSucceeded, revalidateApi } from "@/lib/api-client-cache";
import { isProjectOrgAdminRole } from "@/lib/project-org-role";

function emptyForm() {
  return { name: "", description: "" };
}

export function AdminProjectOrgRolesPanel() {
  const { showToast } = useToast();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [createBusy, setCreateBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [patchingId, setPatchingId] = useState(/** @type {string | null} */ (null));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [createErrors, setCreateErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [editRow, setEditRow] = useState(/** @type {any} */ (null));
  const [editForm, setEditForm] = useState(emptyForm());
  const [editErrors, setEditErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [delRow, setDelRow] = useState(/** @type {any} */ (null));

  const createDraft = useDraftSync(
    "admin:project-role:new",
    { name: form.name, description: form.description },
    (d) =>
      setForm((p) => ({
        name: typeof d.name === "string" ? d.name : p.name,
        description: typeof d.description === "string" ? d.description : p.description,
      })),
    { enabled: open },
  );

  const editDraft = useDraftSync(
    editRow ? `admin:project-role:edit:${editRow.id}` : "",
    { description: editForm.description },
    (d) => {
      if (typeof d.description === "string") {
        const description = d.description;
        setEditForm((p) => ({ ...p, description }));
      }
    },
    { enabled: Boolean(editRow), resetKey: editRow?.id },
  );

  const listQuery = new URLSearchParams({ page: String(page + 1), pageSize: String(rowsPerPage) });
  const {
    data: listData,
    loading,
    refreshing: refetching,
    reload,
  } = useApi(`/api/project-org-roles?${listQuery.toString()}`, {
    errorMessage: "Could not load project roles.",
  });
  const rows = Array.isArray(listData?.roles) ? listData.roles : [];
  const total = Number(listData?.total) || 0;
  const canManage = Boolean(listData?.canManage);
  const load = useCallback(async () => {
    await reload();
    void revalidateApi("/api/project-org-roles", "/api/project-process-flows");
  }, [reload]);

  async function toggleActive(row) {
    if (!canManage) return;
    setPatchingId(row.id);
    try {
      const res = await fetch(`/api/project-org-roles/${row.id}`, {
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
      setPatchingId(null);
    }
  }

  function validateForm(values) {
    /** @type {Record<string, string>} */
    const next = {};
    if (!String(values.name || "").trim()) next.name = "Role name is required.";
    if (String(values.description || "").trim().length > 512) {
      next.description = "Description must be 512 characters or fewer.";
    }
    return next;
  }

  async function createRole() {
    const next = validateForm(form);
    setCreateErrors(next);
    if (Object.keys(next).length > 0) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error", duration: 6000 });
      return;
    }

    setCreateBusy(true);
    try {
      const res = await fetch("/api/project-org-roles", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors && typeof data.fieldErrors === "object") {
          setCreateErrors(data.fieldErrors);
        }
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not create role.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Project role created.", severity: "success" });
      createDraft.clearDraft();
      setOpen(false);
      setCreateErrors({});
      setForm(emptyForm());
      await load({ silent: true });
    } finally {
      setCreateBusy(false);
    }
  }

  function openEdit(row) {
    setEditRow(row);
    setEditForm({
      name: row.name || "",
      description: row.description || "",
    });
    setEditErrors({});
  }

  async function saveEdit() {
    if (!editRow) return;
    const next = validateForm(editForm);
    setEditErrors(next);
    if (Object.keys(next).length > 0) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error", duration: 6000 });
      return;
    }

    setEditBusy(true);
    try {
      const res = await fetch(`/api/project-org-roles/${editRow.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: editForm.description.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors && typeof data.fieldErrors === "object") {
          setEditErrors(data.fieldErrors);
        }
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save changes.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Project role updated.", severity: "success" });
      editDraft.clearDraft();
      setEditRow(null);
      setEditErrors({});
      await load({ silent: true });
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteRole() {
    if (!delRow) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/project-org-roles/${delRow.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!deleteSucceeded(res)) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not delete role.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Project role deleted.", severity: "success" });
      setDelRow(null);
      await load({ silent: true });
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy="true" aria-label="Loading project roles">
        <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <>
      {canManage ? (
        <>
          <Button
            variant="contained"
            startIcon={<AddRounded />}
            disabled={refetching}
            onClick={() => {
              setCreateErrors({});
              setForm(emptyForm());
              setOpen(true);
            }}
            sx={{ mb: 2 }}
            className="w-full sm:w-auto"
            title="Add a project organisation role"
          >
            Add project role
          </Button>
        </>
      ) : (
        <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
          You can review project roles here. Only system admin can add or change them.
        </Typography>
      )}

      <Box sx={{ position: "relative" }}>
        <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Active</TableCell>
                {canManage ? <TableCell align="right">Actions</TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 4 : 3} align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" sx={adminMutedTextSx}>
                      No project roles yet.
                      {canManage ? " Add one with the button above." : ""}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const required = Boolean(row.isRequired) || isProjectOrgAdminRole(row.name);
                  return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                        <span>{row.name}</span>
                        {required ? (
                          <Chip size="small" label="Required" color="info" sx={{ height: 22 }} />
                        ) : null}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="body2" noWrap title={row.description || undefined}>
                        {row.description || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <Switch
                          checked={row.isActive}
                          onChange={() => void toggleActive(row)}
                          disabled={required || patchingId === row.id || refetching}
                        />
                      ) : (
                        <Typography variant="body2">{row.isActive ? "Yes" : "No"}</Typography>
                      )}
                    </TableCell>
                    {canManage ? (
                      <TableCell align="right">
                        <Box sx={{ display: "inline-flex", gap: 0.25, justifyContent: "flex-end" }}>
                          <Tooltip title="Edit description (role names are fixed)">
                            <IconButton
                              size="small"
                              color="primary"
                              aria-label={`Edit description for ${row.name}`}
                              disabled={refetching}
                              onClick={() => openEdit(row)}
                            >
                              <EditRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {required ? null : (
                            <Tooltip title="Delete project role">
                              <IconButton
                                size="small"
                                color="error"
                                aria-label="Delete project role"
                                disabled={refetching}
                                onClick={() => setDelRow(row)}
                              >
                                <DeleteOutlineRounded fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    ) : null}
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
          <Box sx={adminTableRefetchOverlaySx} aria-busy="true" aria-label="Updating project roles">
            <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
          </Box>
        ) : null}
      </Box>

      <Dialog
        open={Boolean(delRow)}
        onClose={() => !deleteBusy && setDelRow(null)}
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Delete project role {delRow?.name}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Students will no longer see this role when configuring their organisation. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelRow(null)} disabled={deleteBusy}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={() => void deleteRole()} disabled={deleteBusy}>
            {deleteBusy ? <CircularProgress size={22} color="inherit" aria-hidden /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <RoleFormDialog
        title="Edit role description"
        open={Boolean(editRow)}
        busy={editBusy}
        form={editForm}
        errors={editErrors}
        nameDisabled
        onClose={() => {
          if (editBusy) return;
          editDraft.clearDraft();
          setEditRow(null);
          setEditErrors({});
        }}
        onChange={(patch) => setEditForm((p) => ({ ...p, ...patch }))}
        onClearError={(key) =>
          setEditErrors((p) => {
            const next = { ...p };
            delete next[key];
            return next;
          })
        }
        onSubmit={() => void saveEdit()}
      />

      <RoleFormDialog
        title="New project role"
        open={open}
        busy={createBusy}
        form={form}
        errors={createErrors}
        onClose={() => {
          if (createBusy) return;
          createDraft.clearDraft();
          setOpen(false);
          setCreateErrors({});
        }}
        onChange={(patch) => setForm((p) => ({ ...p, ...patch }))}
        onClearError={(key) =>
          setCreateErrors((p) => {
            const next = { ...p };
            delete next[key];
            return next;
          })
        }
        onSubmit={() => void createRole()}
      />
    </>
  );
}

/**
 * @param {{
 *   title: string;
 *   open: boolean;
 *   busy: boolean;
 *   form: { name: string; description: string };
 *   errors: Record<string, string>;
 *   onClose: () => void;
 *   onChange: (patch: Partial<{ name: string; description: string }>) => void;
 *   onClearError: (key: string) => void;
 *   onSubmit: () => void;
 *   nameDisabled?: boolean;
 * }} p
 */
function RoleFormDialog({ title, open, busy, form, errors, onClose, onChange, onClearError, onSubmit, nameDisabled = false }) {
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
            label="Role name"
            value={form.name}
            onChange={(e) => {
              onChange({ name: e.target.value });
              onClearError("name");
            }}
            error={Boolean(errors.name)}
            helperText={
              errors.name ||
              (nameDisabled ? "Fixed" : "Cannot be changed later")
            }
            fullWidth
            disabled={nameDisabled}
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
        </Box>
      </DialogContent>
      <DialogActions className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
        <Button type="button" onClick={onClose} disabled={busy} className="w-full sm:w-auto">
          Cancel
        </Button>
        <Button type="button" variant="contained" disabled={busy} className="w-full sm:w-auto" onClick={onSubmit}>
          {busy ? <CircularProgress size={22} color="inherit" aria-hidden /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
