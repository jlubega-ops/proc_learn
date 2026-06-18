"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import BlockRounded from "@mui/icons-material/BlockRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import ForwardToInboxRounded from "@mui/icons-material/ForwardToInboxRounded";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import LockOpenRounded from "@mui/icons-material/LockOpenRounded";
import PersonAddAlt1Rounded from "@mui/icons-material/PersonAddAlt1Rounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import Link from "next/link";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import FormGroup from "@mui/material/FormGroup";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminOutlinedTableContainerSx,
  adminTableRefetchOverlaySx,
  adminTableSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";
import { ROLE, formatRoleLabel } from "@/lib/roles";
import { BRAND_BTN_PRIMARY_CLASS } from "@/lib/brand-ui";

/**
 * @typedef {{
 *   id: string;
 *   email: string;
 *   displayName: string;
 *   firstName: string;
 *   lastName: string;
 *   middleName: string | null;
 *   accountStatus: string;
 *   suspendedReason: string | null;
 *   lastLoginAt: string | null;
 *   roles: string[];
 *   canResendActivation: boolean;
 *   canResendWelcome: boolean;
 *   mustChangePassword: boolean;
 * }} StaffRow
 */

const STAFF_ROLES = [ROLE.SYSTEM_ADMIN, ROLE.EXAMINER, ROLE.LECTURER];

function formatWhen(iso) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

function statusLabel(row) {
  if (row.accountStatus === "SUSPENDED") return "Suspended";
  if (row.accountStatus === "PENDING_ACTIVATION") return "Pending activation";
  if (row.mustChangePassword && !row.lastLoginAt) return "Pending password setup";
  return "Active";
}

export function AdminStaffPanel() {
  const { showToast } = useToast();
  /** @type {[StaffRow[], import("react").Dispatch<import("react").SetStateAction<StaffRow[]>>]} */
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(
    /** @type {{ title: string; text: string } | null} */ (null),
  );
  const [suspendTarget, setSuspendTarget] = useState(/** @type {StaffRow | null} */ (null));
  const [suspendReason, setSuspendReason] = useState("");
  const [editRow, setEditRow] = useState(/** @type {StaffRow | null} */ (null));
  const [delRow, setDelRow] = useState(/** @type {StaffRow | null} */ (null));
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [rolePick, setRolePick] = useState(/** @type {Record<string, boolean>} */ ({}));
  const [activeRole, setActiveRole] = useState(ROLE.LECTURER);
  const [saving, setSaving] = useState(false);
  const [suspendBusy, setSuspendBusy] = useState(false);
  const [unsuspendTarget, setUnsuspendTarget] = useState(/** @type {StaffRow | null} */ (null));
  const [unsuspendBusy, setUnsuspendBusy] = useState(false);
  const [resendingId, setResendingId] = useState(/** @type {string | null} */ (null));

  const pickedRoles = useMemo(
    () => STAFF_ROLES.filter((r) => rolePick[r]),
    [rolePick],
  );

  const load = useCallback(
    async (opts = /** @type {{ silent?: boolean }} */ ({})) => {
      const silent = Boolean(opts.silent);
      if (silent) setRefetching(true);
      else setLoading(true);
      try {
        const res = await fetch("/api/admin/staff", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast({
            message: typeof data.error === "string" ? data.error : "Could not load staff.",
            severity: "error",
          });
          setRows([]);
          return;
        }
        setRows(Array.isArray(data.users) ? data.users : []);
      } finally {
        if (silent) setRefetching(false);
        else setLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(row) {
    setEditRow(row);
    setFirstName(row.firstName || "");
    setLastName(row.lastName || "");
    setMiddleName(row.middleName || "");
    const rp = {};
    STAFF_ROLES.forEach((r) => {
      rp[r] = row.roles.includes(r);
    });
    setRolePick(rp);
  }

  async function saveEdit() {
    if (!editRow) return;
    if (pickedRoles.length === 0) {
      showToast({ message: "Select at least one role.", severity: "error" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/staff/${editRow.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          middleName: middleName.trim() || null,
          roles: pickedRoles,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Staff user updated.", severity: "success" });
      setEditRow(null);
      await load({ silent: true });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!delRow) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/staff/${delRow.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not delete.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Staff user deleted.", severity: "success" });
      setDelRow(null);
      await load({ silent: true });
    } finally {
      setSaving(false);
    }
  }

  async function resendActivation(id) {
    setResendingId(id);
    try {
      const res = await fetch(`/api/users/${id}/resend-activation`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not resend.",
          severity: "error",
        });
        return;
      }
      showToast({
        message:
          typeof data.message === "string" ? data.message : "Invitation email sent.",
        severity: "success",
      });
    } finally {
      setResendingId(null);
    }
  }

  async function confirmSuspend() {
    if (!suspendTarget) return;
    setSuspendBusy(true);
    try {
      const res = await fetch(`/api/users/${suspendTarget.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suspended: true,
          reason: suspendReason.trim() || "No reason provided.",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not suspend.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "User suspended.", severity: "success" });
      setSuspendTarget(null);
      setSuspendReason("");
      await load({ silent: true });
    } finally {
      setSuspendBusy(false);
    }
  }

  async function confirmUnsuspendStaff() {
    if (!unsuspendTarget) return;
    setUnsuspendBusy(true);
    try {
      const res = await fetch(`/api/users/${unsuspendTarget.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not unsuspend.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "User reactivated.", severity: "success" });
      setUnsuspendTarget(null);
      await load({ silent: true });
    } finally {
      setUnsuspendBusy(false);
    }
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy="true" aria-label="Loading staff">
        <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outlined"
          startIcon={refetching ? <CircularProgress size={16} /> : <RefreshRounded />}
          onClick={() => void load({ silent: true })}
          disabled={refetching}
          className="w-full sm:w-auto"
          title="Refresh staff list"
        >
          Refresh
        </Button>
        <Link
          href="/admin/staff/new"
          className={`${BRAND_BTN_PRIMARY_CLASS} h-9 min-h-9 w-full gap-1.5 sm:w-auto sm:px-4`}
          title="Add a new staff user"
        >
          <PersonAddAlt1Rounded sx={{ fontSize: 20 }} aria-hidden />
          <span>Add staff</span>
        </Link>
      </div>

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
              <TableCell>Email</TableCell>
              <TableCell>Roles</TableCell>
              <TableCell>Last login</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.displayName}</TableCell>
                <TableCell>{row.email}</TableCell>
                <TableCell>
                  {(row.roles || []).map((r) => formatRoleLabel(r)).join(", ")}
                </TableCell>
                <TableCell>{formatWhen(row.lastLoginAt)}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1">
                    {statusLabel(row)}
                    {row.accountStatus === "SUSPENDED" && row.suspendedReason ? (
                      <IconButton
                        size="small"
                        aria-label="View suspension reason"
                        onClick={() =>
                          setReasonOpen({
                            title: "Suspension reason",
                            text: row.suspendedReason || "",
                          })
                        }
                      >
                        <InfoOutlined fontSize="small" />
                      </IconButton>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  <Box sx={{ display: "inline-flex", gap: 0.25, justifyContent: "flex-end" }}>
                    <Tooltip title="Edit staff user">
                      <IconButton
                        size="small"
                        aria-label="Edit staff user"
                        onClick={() => openEdit(row)}
                      >
                        <EditRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete staff user">
                      <IconButton
                        size="small"
                        color="error"
                        aria-label="Delete staff user"
                        onClick={() => setDelRow(row)}
                      >
                        <DeleteOutlineRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {row.canResendWelcome || row.canResendActivation ? (
                      <Tooltip
                        title={
                          row.canResendWelcome
                            ? "Resend welcome email with new temporary password"
                            : "Resend activation email"
                        }
                      >
                        <span>
                          <IconButton
                            size="small"
                            aria-label={
                              row.canResendWelcome
                                ? "Resend welcome email"
                                : "Resend activation email"
                            }
                            disabled={resendingId === row.id}
                            onClick={() => void resendActivation(row.id)}
                          >
                            {resendingId === row.id ? (
                              <CircularProgress size={18} color="inherit" aria-hidden />
                            ) : (
                              <ForwardToInboxRounded fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                    ) : null}
                    {row.accountStatus === "SUSPENDED" ? (
                      <Tooltip title="Unsuspend account">
                        <IconButton
                          size="small"
                          color="success"
                          aria-label="Unsuspend account"
                          onClick={() => setUnsuspendTarget(row)}
                        >
                          <LockOpenRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Suspend account">
                        <IconButton
                          size="small"
                          color="warning"
                          aria-label="Suspend account"
                          onClick={() => {
                            setSuspendTarget(row);
                            setSuspendReason("");
                          }}
                        >
                          <BlockRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </TableContainer>
        {refetching ? (
          <Box
            sx={adminTableRefetchOverlaySx}
            aria-busy="true"
            aria-label="Updating staff"
          >
            <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
          </Box>
        ) : null}
      </Box>

      <Dialog
        open={Boolean(editRow)}
        onClose={() => {
          if (!saving) setEditRow(null);
        }}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Edit staff — {editRow?.email}</DialogTitle>
        <DialogContent className="flex flex-col gap-3 pt-2">
          <TextField
            label="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            fullWidth
            sx={themedTextFieldSx}
          />
          <TextField
            label="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            fullWidth
            sx={themedTextFieldSx}
          />
          <TextField
            label="Middle name"
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
            fullWidth
            sx={themedTextFieldSx}
          />
          <Typography variant="subtitle2" sx={{ color: "var(--foreground)" }}>
            Roles
          </Typography>
          <FormGroup>
            {STAFF_ROLES.map((r) => (
              <FormControlLabel
                key={r}
                control={
                  <Checkbox
                    checked={Boolean(rolePick[r])}
                    onChange={() => setRolePick((prev) => ({ ...prev, [r]: !prev[r] }))}
                    sx={{
                      color: "color-mix(in oklab, var(--foreground) 55%, transparent)",
                      "&.Mui-checked": { color: "#008bd0" },
                    }}
                  />
                }
                label={formatRoleLabel(r)}
              />
            ))}
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => !saving && setEditRow(null)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void saveEdit()} disabled={saving}>
            {saving ? <CircularProgress size={22} color="inherit" aria-hidden /> : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(delRow)}
        onClose={() => !saving && setDelRow(null)}
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Delete {delRow?.email}?</DialogTitle>
        <DialogContent>
          <Typography>This permanently removes the staff account and cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelRow(null)} disabled={saving}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void confirmDelete()}
            disabled={saving}
          >
            {saving ? <CircularProgress size={22} color="inherit" aria-hidden /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(reasonOpen)}
        onClose={() => setReasonOpen(null)}
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>{reasonOpen?.title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {reasonOpen?.text}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReasonOpen(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(unsuspendTarget)}
        onClose={() => !unsuspendBusy && setUnsuspendTarget(null)}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Unsuspend {unsuspendTarget?.email}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mt: 0.5, color: "var(--foreground)" }}>
            This restores the account to active status. The suspension reason stored for admins will be
            permanently cleared and will no longer appear in lists or dialogs.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnsuspendTarget(null)} disabled={unsuspendBusy}>
            Cancel
          </Button>
          <Button
            color="success"
            variant="contained"
            onClick={() => void confirmUnsuspendStaff()}
            disabled={unsuspendBusy}
          >
            {unsuspendBusy ? (
              <CircularProgress size={22} color="inherit" aria-hidden />
            ) : (
              "Unsuspend and clear reason"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(suspendTarget)}
        onClose={() => !suspendBusy && setSuspendTarget(null)}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Suspend {suspendTarget?.email}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Reason (visible to admins)"
            fullWidth
            multiline
            minRows={2}
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            sx={themedTextFieldSx}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuspendTarget(null)} disabled={suspendBusy}>
            Cancel
          </Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => void confirmSuspend()}
            disabled={suspendBusy}
          >
            {suspendBusy ? (
              <CircularProgress size={22} color="inherit" aria-hidden />
            ) : (
              "Suspend account"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
