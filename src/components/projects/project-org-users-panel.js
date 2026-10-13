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
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import { format } from "date-fns";
import { discardConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useDraftState } from "@/hooks/use-draft-state";
import { useApi } from "@/hooks/use-api";
import { deleteSucceeded, revalidateApi } from "@/lib/api-client-cache";
import { formatUserDisplayName } from "@/lib/user-display";
import {
  validateProjectOrgUserInput,
  validateProjectOrgUserPatch,
} from "@/lib/validation/project-org-user";
import { buildOrgUserLoginEmail, orgUserNameKey } from "@/lib/projects/org-login-identity";
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

function emptyForm() {
  return {
    firstName: "",
    lastName: "",
    projectOrgRoleId: "",
    departmentId: "",
    subunitId: "",
  };
}

/**
 * @param {string | Date | null | undefined} value
 */
function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy");
}

/**
 * @param {{ projectId: string }} p
 */
export function ProjectOrgUsersPanel({ projectId }) {
  const { showToast } = useToast();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const listQuery = new URLSearchParams({ page: String(page + 1), pageSize: String(rowsPerPage) });
  const {
    data: listData,
    loading,
    refreshing: refetching,
    reload,
  } = useApi(`/api/projects/${projectId}/org-users?${listQuery.toString()}`, {
    errorMessage: "Could not load user accounts.",
  });
  const rows = Array.isArray(listData?.users) ? listData.users : [];
  /** @type {{ id: string; name: string }[]} */
  const roles = Array.isArray(listData?.assignableRoles) ? listData.assignableRoles : [];
  const departments = Array.isArray(listData?.assignableDepartments) ? listData.assignableDepartments : [];
  const total = Number(listData?.total) || 0;
  const projectCode = typeof listData?.projectCode === "string" ? listData.projectCode : "";
  const load = useCallback(async () => {
    await reload();
    void revalidateApi(`/api/projects/${projectId}/org-`);
  }, [projectId, reload]);

  const [openCreate, setOpenCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const confirm = useConfirm();
  const [createForm, setCreateForm, createDraft] = useDraftState(
    `org:user:${projectId}:new`,
    {
      ...emptyForm(),
      projectOrgRoleId: roles[0]?.id || "",
      departmentId: departments[0]?.id || "",
    },
    { enabled: openCreate, resetKey: openCreate },
  );
  const [createErrors, setCreateErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  );

  const [editRow, setEditRow] = useState(/** @type {any} */ (null));
  const [editForm, setEditForm, editDraft] = useDraftState(
    `org:user:${projectId}:edit:${editRow?.id || ""}`,
    editRow
      ? {
          firstName: editRow.firstName || "",
          lastName: editRow.lastName || "",
          projectOrgRoleId: editRow.role?.id || "",
          departmentId: editRow.department?.id || "",
          subunitId: editRow.subunit?.id || "",
        }
      : emptyForm(),
    { enabled: Boolean(editRow), resetKey: editRow?.id ?? null },
  );
  const [editErrors, setEditErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  );
  const [editBusy, setEditBusy] = useState(false);

  const [delRow, setDelRow] = useState(/** @type {any} */ (null));
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [viewRow, setViewRow] = useState(/** @type {any} */ (null));

  async function createUser() {
    const validated = validateProjectOrgUserInput(createForm);
    if (!validated.ok) {
      setCreateErrors(validated.errors);
      showToast({
        message: "Please fix the highlighted fields.",
        severity: "error",
      });
      return;
    }

    setCreateBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/org-users`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors && typeof data.fieldErrors === "object") {
          setCreateErrors(data.fieldErrors);
        }
        showToast({
          message:
            typeof data.error === "string"
              ? data.error
              : "Could not create user account.",
          severity: "error",
        });
        return;
      }
      showToast({
        message: data.loginEmail
          ? `User account created. Login email: ${data.loginEmail}`
          : "User account created.",
        severity: "success",
      });
      createDraft.clearDraft();
      setOpenCreate(false);
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
    createDraft.clearDraft();
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
    const validated = validateProjectOrgUserPatch(editForm);
    if (!validated.ok) {
      setEditErrors(validated.errors);
      showToast({
        message: "Please fix the highlighted fields.",
        severity: "error",
      });
      return;
    }

    setEditBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/org-users/${editRow.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editForm),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors && typeof data.fieldErrors === "object") {
          setEditErrors(data.fieldErrors);
        }
        showToast({
          message:
            typeof data.error === "string"
              ? data.error
              : "Could not save changes.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "User account updated.", severity: "success" });
      editDraft.clearDraft();
      setEditRow(null);
      setEditErrors({});
      await load({ silent: true });
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteUser() {
    if (!delRow) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/org-users/${delRow.id}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!deleteSucceeded(res)) {
        showToast({
          message:
            typeof data.error === "string"
              ? data.error
              : "Could not delete user account.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "User account deleted.", severity: "success" });
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
        aria-label="Loading user accounts"
      >
        <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          variant="contained"
          startIcon={<AddRounded />}
          disabled={
            refetching || roles.length === 0 || departments.length === 0
          }
          onClick={() => {
            setCreateErrors({});
            setOpenCreate(true);
          }}
          className="w-full sm:w-auto"
          title="Create organisation user account"
        >
          Add user account
        </Button>
        <Button
          variant="outlined"
          startIcon={
            refetching ? <CircularProgress size={16} /> : <RefreshRounded />
          }
          disabled={refetching}
          onClick={() => load({ silent: true })}
          className="w-full sm:w-auto"
          title="Refresh user accounts"
        >
          Refresh
        </Button>
      </div>

      {roles.length === 0 ? (
        <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
          No roles available yet.
        </Typography>
      ) : null}

      {departments.length === 0 ? (
        <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
          Create a department first.
        </Typography>
      ) : null}

      <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
        Password for all users: <span className="font-semibold">password123</span>
      </Typography>

      <Box sx={{ position: "relative" }}>
        <TableContainer
          component={Paper}
          variant="outlined"
          sx={adminOutlinedTableContainerSx}
        >
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Department</TableCell>
                <TableCell>Subunit</TableCell>
                <TableCell>Login email</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" sx={adminMutedTextSx}>
                      No user accounts yet. Your project Admin row appears after
                      the first load.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    hover
                    onClick={() => setViewRow(row)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          flexWrap: "wrap",
                        }}
                      >
                        <span>{formatUserDisplayName(row)}</span>
                        {row.isProjectAdmin ? (
                          <Chip
                            size="small"
                            label="You"
                            color="info"
                            sx={{ height: 22 }}
                          />
                        ) : null}
                      </Box>
                    </TableCell>
                    <TableCell>{row.role?.name || "—"}</TableCell>
                    <TableCell>{row.department?.name || "—"}</TableCell>
                    <TableCell>{row.subunit?.name || "—"}</TableCell>
                    <TableCell sx={{ wordBreak: "break-all" }}>
                      {row.isProjectAdmin ? "—" : row.loginEmail || "—"}
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Box sx={{ display: "inline-flex", gap: 0.25 }}>
                        <Tooltip title="View details">
                          <IconButton
                            size="small"
                            aria-label="View user account details"
                            color="info"
                            disabled={refetching}
                            onClick={() => setViewRow(row)}
                          >
                            <VisibilityRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {!row.isProjectAdmin ? (
                          <>
                            <Tooltip title="Edit user account">
                              <IconButton
                                size="small"
                                aria-label="Edit user account"
                                color="primary"
                                disabled={refetching}
                                onClick={() => openEdit(row)}
                              >
                                <EditRounded fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete user account">
                              <IconButton
                                size="small"
                                aria-label="Delete user account"
                                color="error"
                                disabled={refetching}
                                onClick={() => setDelRow(row)}
                              >
                                <DeleteOutlineRounded fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        ) : null}
                      </Box>
                    </TableCell>
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
            aria-label="Updating user accounts"
          >
            <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
          </Box>
        ) : null}
      </Box>

      <OrgUserDetailsDialog
        user={viewRow}
        projectCode={projectCode}
        onClose={() => setViewRow(null)}
        onEdit={
          viewRow && !viewRow.isProjectAdmin
            ? () => {
                const row = viewRow;
                setViewRow(null);
                openEdit(row);
              }
            : undefined
        }
      />

      <OrgUserFormDialog
        title="New user account"
        open={openCreate}
        busy={createBusy}
        form={createForm}
        errors={createErrors}
        roles={roles}
        departments={departments}
        projectCode={projectCode}
        onClose={() => void closeCreate()}
        onChange={(patch) => setCreateForm((p) => ({ ...p, ...patch }))}
        onClearError={(key) =>
          setCreateErrors((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          })
        }
        onSubmit={() => void createUser()}
        isCreate
      />

      <OrgUserFormDialog
        title="Edit user account"
        open={Boolean(editRow)}
        busy={editBusy}
        form={editForm}
        errors={editErrors}
        roles={roles}
        departments={departments}
        savedUser={editRow}
        projectCode={projectCode}
        onClose={() => void closeEdit()}
        onChange={(patch) => setEditForm((p) => ({ ...p, ...patch }))}
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
        <DialogTitle>Delete {formatUserDisplayName(delRow || {})}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This removes the organisation user account from this project. This
            cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelRow(null)} disabled={deleteBusy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void deleteUser()}
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
 * @param {{ user: any; projectCode?: string; onClose: () => void; onEdit?: () => void }} p
 */
function OrgUserDetailsDialog({ user, projectCode = "", onClose, onEdit }) {
  const { showToast } = useToast();
  if (!user) return null;

  /**
   * @param {string} label
   * @param {string} text
   */
  async function copyText(label, text) {
    const value = String(text || "").trim();
    if (!value || value === "—") {
      showToast({ message: `No ${label.toLowerCase()} to copy.`, severity: "error" });
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      showToast({ message: `${label} copied.`, severity: "success" });
    } catch {
      showToast({ message: `Could not copy ${label.toLowerCase()}.`, severity: "error" });
    }
  }

  const fields = [
    { label: "Full name", value: formatUserDisplayName(user) },
    ...(projectCode ? [{ label: "Project code", value: projectCode }] : []),
    ...(user.isProjectAdmin && user.studentNumber
      ? [{ label: "Student number", value: user.studentNumber }]
      : []),
    { label: "Role", value: user.role?.name || "—" },
    { label: "Department", value: user.department?.name || "—" },
    { label: "Subunit", value: user.subunit?.name || "—" },
    ...(!user.isProjectAdmin
      ? [
          {
            label: "Login email",
            value: user.loginEmail || "—",
            copyable: Boolean(user.loginEmail),
          },
          {
            label: "Password",
            value: user.password || "—",
            copyable: Boolean(user.password),
          },
        ]
      : []),
    { label: "Added", value: fmtDate(user.createdAt) },
  ];

  return (
    <Dialog
      open={Boolean(user)}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: adminDialogPaperSx } }}
    >
      <DialogTitle>
        {user.isProjectAdmin ? "Your project Admin account" : "User account details"}
      </DialogTitle>
      <DialogContent dividers>
        <dl className="grid gap-3 sm:grid-cols-[minmax(8rem,34%)_1fr]">
          {fields.map(({ label, value, copyable }) => (
            <div key={label} className="contents">
              <dt className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{label}</dt>
              <dd className="flex items-start gap-1 text-sm text-zinc-900 dark:text-zinc-100 break-all">
                <span className="min-w-0 flex-1">{value}</span>
                {copyable ? (
                  <Tooltip title={`Copy ${label.toLowerCase()}`}>
                    <IconButton
                      size="small"
                      color="primary"
                      aria-label={`Copy ${label.toLowerCase()}`}
                      onClick={() => void copyText(label, value)}
                      className="shrink-0"
                    >
                      <ContentCopyRounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
        {user.isProjectAdmin ? (
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mt: 2 }}>
            Your Admin account — not editable.
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {onEdit ? (
          <Button
            variant="contained"
            startIcon={<EditRounded />}
            onClick={onEdit}
          >
            Edit
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}

/**
 * @param {{
 *   title: string;
 *   open: boolean;
 *   busy: boolean;
 *   form: ReturnType<typeof emptyForm>;
 *   errors: Record<string, string>;
 *   roles: { id: string; name: string }[];
 *   departments: any[];
 *   savedUser?: any;
 *   projectCode?: string;
 *   isCreate?: boolean;
 *   onClose: () => void;
 *   onChange: (patch: Partial<ReturnType<typeof emptyForm>>) => void;
 *   onClearError: (key: string) => void;
 *   onSubmit: () => void;
 * }} p
 */
function OrgUserFormDialog({
  title,
  open,
  busy,
  form,
  errors,
  roles,
  departments,
  savedUser,
  projectCode = "",
  isCreate = false,
  onClose,
  onChange,
  onClearError,
  onSubmit,
}) {
  const subunits =
    departments.find((d) => d.id === form.departmentId)?.subunits || [];
  const nameKey = orgUserNameKey(form);
  const loginPreview =
    !isCreate && savedUser?.loginEmail && nameKey === orgUserNameKey(savedUser)
      ? savedUser.loginEmail
      : nameKey && projectCode
        ? buildOrgUserLoginEmail({ ...form, projectCode })
        : "";

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
            label="First name"
            value={form.firstName}
            onChange={(e) => {
              onChange({ firstName: e.target.value });
              onClearError("firstName");
            }}
            error={Boolean(errors.firstName)}
            helperText={errors.firstName}
            fullWidth
            sx={themedTextFieldSx}
          />
          <TextField
            label="Last name"
            value={form.lastName}
            onChange={(e) => {
              onChange({ lastName: e.target.value });
              onClearError("lastName");
            }}
            error={Boolean(errors.lastName)}
            helperText={errors.lastName}
            fullWidth
            sx={themedTextFieldSx}
          />
          <TextField
            label="Login email"
            value={loginPreview}
            placeholder="firstname.lastname@…"
            helperText="Generated"
            fullWidth
            disabled
            sx={themedTextFieldSx}
          />
          <FormControl
            fullWidth
            error={Boolean(errors.departmentId)}
            sx={{
              ...themedTextFieldSx,
              "& .MuiInputLabel-root":
                themedTextFieldSx["& .MuiInputLabel-root"],
            }}
          >
            <InputLabel id="org-user-dept-label">Department</InputLabel>
            <Select
              labelId="org-user-dept-label"
              label="Department"
              value={form.departmentId}
              onChange={(e) => {
                onChange({
                  departmentId: String(e.target.value),
                  subunitId: "",
                });
                onClearError("departmentId");
                onClearError("subunitId");
              }}
            >
              {departments.map((dept) => (
                <MenuItem key={dept.id} value={dept.id}>
                  {dept.name}
                </MenuItem>
              ))}
            </Select>
            {errors.departmentId ? (
              <Typography
                variant="caption"
                color="error"
                sx={{ mt: 0.5, ml: 1.75 }}
              >
                {errors.departmentId}
              </Typography>
            ) : null}
          </FormControl>
          <FormControl
            fullWidth
            disabled={!form.departmentId || subunits.length === 0}
            error={Boolean(errors.subunitId)}
            sx={{
              ...themedTextFieldSx,
              "& .MuiInputLabel-root":
                themedTextFieldSx["& .MuiInputLabel-root"],
            }}
          >
            <InputLabel id="org-user-subunit-label">
              Subunit (optional)
            </InputLabel>
            <Select
              labelId="org-user-subunit-label"
              label="Subunit (optional)"
              value={form.subunitId || ""}
              onChange={(e) => {
                onChange({ subunitId: String(e.target.value) });
                onClearError("subunitId");
              }}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {subunits.map((sub) => (
                <MenuItem key={sub.id} value={sub.id}>
                  {sub.name}
                </MenuItem>
              ))}
            </Select>
            {errors.subunitId ? (
              <Typography
                variant="caption"
                color="error"
                sx={{ mt: 0.5, ml: 1.75 }}
              >
                {errors.subunitId}
              </Typography>
            ) : null}
          </FormControl>
          <FormControl
            fullWidth
            error={Boolean(errors.projectOrgRoleId)}
            sx={{
              ...themedTextFieldSx,
              "& .MuiInputLabel-root":
                themedTextFieldSx["& .MuiInputLabel-root"],
            }}
          >
            <InputLabel id="org-user-role-label">Role</InputLabel>
            <Select
              labelId="org-user-role-label"
              label="Role"
              value={form.projectOrgRoleId}
              onChange={(e) => {
                onChange({ projectOrgRoleId: String(e.target.value) });
                onClearError("projectOrgRoleId");
              }}
            >
              {roles.map((role) => (
                <MenuItem key={role.id} value={role.id}>
                  {role.name}
                </MenuItem>
              ))}
            </Select>
            {errors.projectOrgRoleId ? (
              <Typography
                variant="caption"
                color="error"
                sx={{ mt: 0.5, ml: 1.75 }}
              >
                {errors.projectOrgRoleId}
              </Typography>
            ) : (
              <Typography
                variant="caption"
                sx={{ mt: 0.5, ml: 1.75, ...adminMutedTextSx }}
              >
                Admin is not available — you already hold that role in this
                project.
              </Typography>
            )}
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
        <Button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="w-full sm:w-auto"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="contained"
          disabled={busy}
          className="w-full sm:w-auto"
          onClick={onSubmit}
        >
          {busy ? (
            <CircularProgress size={22} color="inherit" aria-hidden />
          ) : (
            "Save"
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
