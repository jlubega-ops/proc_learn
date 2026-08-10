"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import AddRounded from "@mui/icons-material/AddRounded";
import { format, parseISO } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";

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
    name: "",
    committeeType: "CONTRACTS",
    description: "",
  });
  const [memberForm, setMemberForm] = useState({
    committeeId: "",
    orgUserId: "",
    committeeRole: "MEMBER",
    startDate: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, uRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/org-committees`, { credentials: "include" }),
        fetch(`/api/projects/${projectId}/org-users?page=1&pageSize=100`, {
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

  async function createCommittee(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/org-committees`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
      setForm({ name: "", committeeType: "CONTRACTS", description: "" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function addMember(e) {
    e.preventDefault();
    if (!memberForm.committeeId) return;
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
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not add member.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Committee member added.", severity: "success" });
      setMemberForm((f) => ({ ...f, orgUserId: "", committeeRole: "MEMBER" }));
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
      {!readOnly ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Create committee
          </Typography>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={createCommittee} noValidate>
            <TextField
              label="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              fullWidth
              sx={themedTextFieldSx}
            />
            <TextField
              select
              label="Type"
              value={form.committeeType}
              onChange={(e) => setForm((f) => ({ ...f, committeeType: e.target.value }))}
              fullWidth
              sx={themedTextFieldSx}
            >
              {COMMITTEE_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              fullWidth
              className="sm:col-span-2"
              sx={themedTextFieldSx}
            />
            <div className="sm:col-span-2">
              <Button type="submit" variant="contained" startIcon={<AddRounded />} disabled={busy}>
                Create committee
              </Button>
            </div>
          </form>
        </Paper>
      ) : null}

      {!readOnly ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Add membership
          </Typography>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={addMember} noValidate>
            <TextField
              select
              label="Committee"
              value={memberForm.committeeId}
              onChange={(e) => setMemberForm((f) => ({ ...f, committeeId: e.target.value }))}
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
              onChange={(e) => setMemberForm((f) => ({ ...f, orgUserId: e.target.value }))}
              fullWidth
              sx={themedTextFieldSx}
            >
              {users.map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.firstName} {u.lastName} ({u.roleName || u.role?.name || "—"})
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Committee role"
              value={memberForm.committeeRole}
              onChange={(e) => setMemberForm((f) => ({ ...f, committeeRole: e.target.value }))}
              fullWidth
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
                Add member
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
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{c.name}</span>
                  <Chip size="small" label={c.committeeType} color="primary" />
                  <Chip
                    size="small"
                    label={c.isActive ? "Active" : "Inactive"}
                    color={c.isActive ? "success" : "default"}
                  />
                </div>
                {c.description ? (
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{c.description}</p>
                ) : null}
                <ul className="mt-2 space-y-1 text-sm">
                  {(c.members || []).length === 0 ? (
                    <li className="text-zinc-500">No members yet.</li>
                  ) : (
                    c.members.map((m) => (
                      <li key={m.id}>
                        {m.orgUser?.firstName} {m.orgUser?.lastName} — {m.committeeRole}
                        {m.startDate
                          ? ` (from ${format(parseISO(String(m.startDate).slice(0, 10)), "MMM d, yyyy")})`
                          : ""}
                      </li>
                    ))
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Paper>
    </div>
  );
}
