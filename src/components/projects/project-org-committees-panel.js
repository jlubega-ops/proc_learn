"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import PersonRemoveRounded from "@mui/icons-material/PersonRemoveRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { format, parseISO } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import {
  committeeEligibilityHelpText,
  orgRoleMayAppearOnCommittee,
  validateCommitteeSeatEligibility,
} from "@/lib/projects/committee-eligibility";
import { formatCommitteeSeatLabel } from "@/lib/projects/committee-context";

const COMMITTEE_TYPES = [
  { value: "CONTRACTS", label: "Contracts Committee" },
  { value: "EVALUATION", label: "Evaluation Committee" },
  { value: "NEGOTIATION", label: "Negotiation Committee" },
  { value: "INSPECTION_ACCEPTANCE", label: "Inspection/Acceptance Committee" },
];

const MEMBER_ROLES = [
  { value: "CHAIRPERSON", label: "Chairperson" },
  { value: "MEMBER", label: "Member" },
  { value: "SECRETARY", label: "Secretary" },
];

/**
 * @param {{ projectId: string; readOnly?: boolean }} p
 */
export function ProjectOrgCommitteesPanel({ projectId, readOnly = false }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [committees, setCommittees] = useState(/** @type {any[]} */ ([]));
  const [users, setUsers] = useState(/** @type {any[]} */ ([]));
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    committeeType: "EVALUATION",
    description: "",
  });
  const [memberForm, setMemberForm] = useState({
    committeeId: "",
    orgUserId: "",
    committeeRole: "MEMBER",
    startDate: "",
  });
  const [memberFieldErrors, setMemberFieldErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  );

  const [editRow, setEditRow] = useState(/** @type {any | null} */ (null));
  const [editForm, setEditForm] = useState({
    committeeType: "EVALUATION",
    description: "",
    isActive: true,
  });
  const [editErrors, setEditErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [editBusy, setEditBusy] = useState(false);

  const [delRow, setDelRow] = useState(/** @type {any | null} */ (null));
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [unassignSeat, setUnassignSeat] = useState(
    /** @type {{ membership: any; committee: any } | null} */ (null),
  );
  const [unassignBusy, setUnassignBusy] = useState(false);

  const selectedCommittee = useMemo(
    () => committees.find((c) => c.id === memberForm.committeeId) || null,
    [committees, memberForm.committeeId],
  );

  const usedTypes = useMemo(
    () => new Set(committees.map((c) => c.committeeType).filter(Boolean)),
    [committees],
  );

  const availableCreateTypes = useMemo(
    () => COMMITTEE_TYPES.filter((t) => !usedTypes.has(t.value)),
    [usedTypes],
  );

  const availableEditTypes = useMemo(() => {
    if (!editRow) return COMMITTEE_TYPES;
    return COMMITTEE_TYPES.filter(
      (t) => t.value === editRow.committeeType || !usedTypes.has(t.value),
    );
  }, [editRow, usedTypes]);

  useEffect(() => {
    if (availableCreateTypes.length === 0) return;
    if (!availableCreateTypes.some((t) => t.value === form.committeeType)) {
      setForm((f) => ({ ...f, committeeType: availableCreateTypes[0].value }));
    }
  }, [availableCreateTypes, form.committeeType]);

  const eligibleUsers = useMemo(() => {
    if (!selectedCommittee) return users;
    const type = selectedCommittee.committeeType;
    const alreadyOnCommittee = new Set(
      (selectedCommittee.members || []).map((m) => m.orgUser?.id).filter(Boolean),
    );
    return users.filter((u) => {
      if (alreadyOnCommittee.has(u.id)) return false;
      const roleName = u.role?.name || u.roleName || "";
      if (!orgRoleMayAppearOnCommittee(type, roleName)) return false;
      const otherSeats = committees.filter(
        (c) =>
          c.id !== selectedCommittee.id &&
          c.isActive !== false &&
          (c.members || []).some(
            (m) => m.orgUser?.id === u.id && String(m.status || "ACTIVE") === "ACTIVE",
          ),
      );
      const activeContractsSeat = otherSeats.some((c) => c.committeeType === "CONTRACTS");
      const activeEvaluationSeat = otherSeats.some(
        (c) => c.committeeType === "EVALUATION" || c.committeeType === "NEGOTIATION",
      );
      const check = validateCommitteeSeatEligibility({
        committeeType: type,
        committeeRole: memberForm.committeeRole,
        orgRoleName: roleName,
        activeContractsSeat,
        activeEvaluationSeat,
      });
      return check.ok;
    });
  }, [users, committees, selectedCommittee, memberForm.committeeRole]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, uRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/org-committees`, { credentials: "include" }),
        fetch(`/api/projects/${projectId}/org-users?page=1&pageSize=50`, {
          credentials: "include",
        }),
      ]);
      const cData = await cRes.json().catch(() => ({}));
      const uData = await uRes.json().catch(() => ({}));
      if (!cRes.ok) {
        showToast({
          message: typeof cData.error === "string" ? cData.error : "Could not load committees.",
          severity: "error",
        });
        return;
      }
      setCommittees(Array.isArray(cData.committees) ? cData.committees : []);
      setUsers(
        (Array.isArray(uData.users) ? uData.users : []).filter((u) => !u.isProjectAdmin),
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!memberForm.orgUserId) return;
    if (!eligibleUsers.some((u) => u.id === memberForm.orgUserId)) {
      setMemberForm((f) => ({ ...f, orgUserId: "" }));
    }
  }, [eligibleUsers, memberForm.orgUserId]);

  function openEdit(c) {
    setEditErrors({});
    setEditForm({
      committeeType: c.committeeType || "EVALUATION",
      description: c.description || "",
      isActive: c.isActive !== false,
    });
    setEditRow(c);
  }

  async function createCommittee(e) {
    e.preventDefault();
    if (!form.committeeType) {
      showToast({ message: "Choose a committee type.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/org-committees`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          committeeType: form.committeeType,
          description: form.description,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not create committee.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Committee created.", severity: "success" });
      setForm({ committeeType: "EVALUATION", description: "" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editRow) return;
    /** @type {Record<string, string>} */
    const fe = {};
    if (!editForm.committeeType) fe.committeeType = "Choose a committee type.";
    if (Object.keys(fe).length) {
      setEditErrors(fe);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setEditBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/org-committees/${editRow.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          committeeType: editForm.committeeType,
          description: editForm.description,
          isActive: editForm.isActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors && typeof data.fieldErrors === "object") {
          setEditErrors(data.fieldErrors);
        }
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not update committee.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Committee updated.", severity: "success" });
      setEditRow(null);
      await load();
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteCommittee() {
    if (!delRow) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/org-committees/${delRow.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not delete committee.",
          severity: "error",
        });
        return;
      }
      showToast({
        message:
          typeof data.message === "string"
            ? data.message
            : "Committee deleted. Seats unassigned; users kept.",
        severity: "success",
      });
      if (memberForm.committeeId === delRow.id) {
        setMemberForm((f) => ({ ...f, committeeId: "", orgUserId: "" }));
      }
      setDelRow(null);
      await load();
    } finally {
      setDeleteBusy(false);
    }
  }

  async function confirmUnassign() {
    if (!unassignSeat) return;
    const { membership, committee } = unassignSeat;
    setUnassignBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/org-committees/${committee.id}/members/${membership.id}`,
        { method: "DELETE", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not unassign seat.",
          severity: "error",
        });
        return;
      }
      showToast({
        message:
          typeof data.message === "string"
            ? data.message
            : "Seat unassigned. Organisation user unchanged.",
        severity: "success",
      });
      setUnassignSeat(null);
      await load();
    } finally {
      setUnassignBusy(false);
    }
  }

  async function addMember(e) {
    e.preventDefault();
    if (!memberForm.committeeId) return;

    /** @type {Record<string, string>} */
    const fe = {};
    if (!memberForm.orgUserId) fe.orgUserId = "Choose an organisation user.";
    if (!memberForm.committeeRole) fe.committeeRole = "Choose a committee role.";

    if (selectedCommittee && memberForm.orgUserId) {
      const orgUser = users.find((u) => u.id === memberForm.orgUserId);
      const roleName = orgUser?.role?.name || orgUser?.roleName || "";
      const otherSeats = committees.filter(
        (c) =>
          c.id !== selectedCommittee.id &&
          c.isActive !== false &&
          (c.members || []).some(
            (m) =>
              m.orgUser?.id === memberForm.orgUserId &&
              String(m.status || "ACTIVE") === "ACTIVE",
          ),
      );
      const eligibility = validateCommitteeSeatEligibility({
        committeeType: selectedCommittee.committeeType,
        committeeRole: memberForm.committeeRole,
        orgRoleName: roleName,
        activeContractsSeat: otherSeats.some((c) => c.committeeType === "CONTRACTS"),
        activeEvaluationSeat: otherSeats.some(
          (c) => c.committeeType === "EVALUATION" || c.committeeType === "NEGOTIATION",
        ),
      });
      if (!eligibility.ok) {
        if (eligibility.field) fe[eligibility.field] = eligibility.error;
        else fe.orgUserId = eligibility.error;
      }
    }

    if (Object.keys(fe).length) {
      setMemberFieldErrors(fe);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setMemberFieldErrors({});

    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/org-committees/${memberForm.committeeId}/members`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgUserId: memberForm.orgUserId,
            committeeRole: memberForm.committeeRole,
            startDate: memberForm.startDate || undefined,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors && typeof data.fieldErrors === "object") {
          setMemberFieldErrors(data.fieldErrors);
        }
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not add member.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Committee seat added.", severity: "success" });
      setMemberForm((f) => ({ ...f, orgUserId: "", committeeRole: "MEMBER" }));
      setMemberFieldErrors({});
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy>
        <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Create committees, then <strong>Add seat</strong> for people who already exist under Users.
        Their organisation role stays the same; they use <strong>Switch committee context</strong> in
        the account menu when acting as chair, member, or secretary. Deleting a committee or
        unassigning a seat only removes the seat — not the organisation user.
      </p>
      {!readOnly ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Create committee
          </Typography>
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
            Choose a type — that becomes the committee name (e.g. Evaluation Committee). One of each
            type per organisation.
          </Typography>
          {availableCreateTypes.length === 0 ? (
            <Typography variant="body2" sx={adminMutedTextSx}>
              All committee types already exist. Edit or delete one if you need to change it.
            </Typography>
          ) : (
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={createCommittee} noValidate>
              <TextField
                select
                label="Type"
                value={form.committeeType}
                onChange={(e) => setForm((f) => ({ ...f, committeeType: e.target.value }))}
                fullWidth
                sx={themedTextFieldSx}
              >
                {availableCreateTypes.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
                    {t.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Description (optional)"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                fullWidth
                sx={themedTextFieldSx}
              />
              <div className="sm:col-span-2">
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<AddRounded />}
                  disabled={busy}
                >
                  Create committee
                </Button>
              </div>
            </form>
          )}
        </Paper>
      ) : null}

      {!readOnly ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Add seat
          </Typography>
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 1 }}>
            Pick an existing organisation user and the seat they hold on this committee.
          </Typography>
          {selectedCommittee ? (
            <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
              {committeeEligibilityHelpText(selectedCommittee.committeeType)}
            </Typography>
          ) : null}
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={addMember} noValidate>
            <TextField
              select
              label="Committee"
              value={memberForm.committeeId}
              onChange={(e) => {
                setMemberFieldErrors({});
                setMemberForm((f) => ({ ...f, committeeId: e.target.value, orgUserId: "" }));
              }}
              fullWidth
              sx={themedTextFieldSx}
            >
              {committees.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Organisation user"
              value={memberForm.orgUserId}
              onChange={(e) => {
                setMemberFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.orgUserId;
                  return next;
                });
                setMemberForm((f) => ({ ...f, orgUserId: e.target.value }));
              }}
              fullWidth
              error={Boolean(memberFieldErrors.orgUserId)}
              helperText={memberFieldErrors.orgUserId || undefined}
              sx={themedTextFieldSx}
            >
              {eligibleUsers.length === 0 ? (
                <MenuItem value="" disabled>
                  {selectedCommittee
                    ? "No eligible users for this committee / role"
                    : "Select a committee first"}
                </MenuItem>
              ) : (
                eligibleUsers.map((u) => (
                  <MenuItem key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} ({u.role?.name || u.roleName || "—"})
                  </MenuItem>
                ))
              )}
            </TextField>
            <TextField
              select
              label="Committee role"
              value={memberForm.committeeRole}
              onChange={(e) => {
                setMemberFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.committeeRole;
                  return next;
                });
                setMemberForm((f) => ({ ...f, committeeRole: e.target.value }));
              }}
              fullWidth
              error={Boolean(memberFieldErrors.committeeRole)}
              helperText={memberFieldErrors.committeeRole || undefined}
              sx={themedTextFieldSx}
            >
              {MEMBER_ROLES.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="date"
              label="Start date"
              slotProps={{ inputLabel: { shrink: true } }}
              value={memberForm.startDate}
              onChange={(e) => setMemberForm((f) => ({ ...f, startDate: e.target.value }))}
              fullWidth
              sx={themedTextFieldSx}
            />
            <div className="sm:col-span-2">
              <Button type="submit" variant="contained" disabled={busy || !memberForm.committeeId}>
                Add seat
              </Button>
            </div>
          </form>
        </Paper>
      ) : null}

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Committees
          </Typography>
          <Button startIcon={<RefreshRounded />} onClick={() => load()} variant="outlined" size="small">
            Refresh
          </Button>
        </div>
        {committees.length === 0 ? (
          <Typography variant="body2" sx={adminMutedTextSx}>
            No committees yet.
          </Typography>
        ) : (
          <ul className="space-y-3">
            {committees.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-[color:var(--border-subtle)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{c.name}</span>
                    <Chip
                      size="small"
                      label={c.isActive ? "Active" : "Inactive"}
                      color={c.isActive ? "success" : "default"}
                    />
                  </div>
                  {!readOnly ? (
                    <Box sx={{ display: "inline-flex", gap: 0.25, flexShrink: 0 }}>
                      <Tooltip title="Edit committee">
                        <IconButton
                          size="small"
                          color="primary"
                          aria-label={`Edit ${c.name}`}
                          disabled={busy}
                          onClick={() => openEdit(c)}
                        >
                          <EditRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete committee (unassigns seats; keeps users)">
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={`Delete ${c.name}`}
                          disabled={busy}
                          onClick={() => setDelRow(c)}
                        >
                          <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ) : null}
                </div>
                {c.description ? (
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{c.description}</p>
                ) : null}
                <ul className="mt-2 space-y-1 text-sm">
                  {(c.members || []).length === 0 ? (
                    <li className="text-zinc-500">No members yet.</li>
                  ) : (
                    c.members.map((m) => (
                      <li
                        key={m.id}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span>
                          {m.orgUser?.firstName} {m.orgUser?.lastName} —{" "}
                          {formatCommitteeSeatLabel(m.committeeRole) || m.committeeRole}
                          {m.startDate
                            ? ` (from ${format(parseISO(String(m.startDate).slice(0, 10)), "MMM d, yyyy")})`
                            : ""}
                        </span>
                        {!readOnly ? (
                          <Tooltip title="Unassign seat (keeps organisation user)">
                            <IconButton
                              size="small"
                              color="error"
                              aria-label={`Unassign ${m.orgUser?.firstName || "member"} from ${c.name}`}
                              disabled={busy}
                              onClick={() => setUnassignSeat({ membership: m, committee: c })}
                            >
                              <PersonRemoveRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Paper>

      <Dialog
        open={Boolean(editRow)}
        onClose={() => !editBusy && setEditRow(null)}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Edit committee</DialogTitle>
        <DialogContent className="pt-2">
          <Box className="flex flex-col gap-3" component="form" noValidate onSubmit={(e) => e.preventDefault()}>
            <TextField
              select
              label="Type"
              value={editForm.committeeType}
              onChange={(e) => {
                setEditForm((f) => ({ ...f, committeeType: e.target.value }));
                setEditErrors((prev) => {
                  const next = { ...prev };
                  delete next.committeeType;
                  return next;
                });
              }}
              error={Boolean(editErrors.committeeType)}
              helperText={
                editErrors.committeeType ||
                "Type is also the committee name (one of each type per organisation)."
              }
              fullWidth
              sx={themedTextFieldSx}
            >
              {availableEditTypes.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Description (optional)"
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
              sx={themedTextFieldSx}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
              }
              label="Active"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditRow(null)} disabled={editBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void saveEdit()}
            disabled={editBusy}
            {...(editBusy
              ? { startIcon: <CircularProgress size={18} color="inherit" aria-hidden /> }
              : {})}
          >
            {editBusy ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(delRow)}
        onClose={() => !deleteBusy && setDelRow(null)}
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Delete {delRow?.name}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This deletes the committee and unassigns all seats. Organisation users and their org
            roles are <strong>not</strong> deleted.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelRow(null)} disabled={deleteBusy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void deleteCommittee()}
            disabled={deleteBusy}
            {...(deleteBusy
              ? { startIcon: <CircularProgress size={18} color="inherit" aria-hidden /> }
              : {})}
          >
            {deleteBusy ? "Deleting…" : "Delete committee"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(unassignSeat)}
        onClose={() => !unassignBusy && setUnassignSeat(null)}
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Unassign seat?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Remove{" "}
            <strong>
              {unassignSeat?.membership?.orgUser?.firstName}{" "}
              {unassignSeat?.membership?.orgUser?.lastName}
            </strong>{" "}
            (
            {formatCommitteeSeatLabel(unassignSeat?.membership?.committeeRole) ||
              unassignSeat?.membership?.committeeRole}
            ) from <strong>{unassignSeat?.committee?.name}</strong>. Their organisation login and
            org role stay unchanged.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnassignSeat(null)} disabled={unassignBusy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void confirmUnassign()}
            disabled={unassignBusy}
            {...(unassignBusy
              ? { startIcon: <CircularProgress size={18} color="inherit" aria-hidden /> }
              : {})}
          >
            {unassignBusy ? "Unassigning…" : "Unassign seat"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
