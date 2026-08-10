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
import AddRounded from "@mui/icons-material/AddRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";

function emptyLine() {
  return { code: "", name: "", description: "", category: "", approvedAmount: "" };
}

/**
 * Organization Administrator budget view (read-only by default).
 * Operational create/approve is performed by department and finance roles.
 * @param {{ projectId: string; readOnly?: boolean }} p
 */
export function ProjectOrgBudgetsPanel({ projectId, readOnly = true }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [budgets, setBudgets] = useState(/** @type {any[]} */ ([]));
  const [years, setYears] = useState(/** @type {any[]} */ ([]));
  const [departments, setDepartments] = useState(/** @type {any[]} */ ([]));
  const [form, setForm] = useState({
    title: "",
    description: "",
    financialYearId: "",
    departmentId: "",
    lines: [emptyLine()],
  });
  const [selectedId, setSelectedId] = useState(/** @type {string | null} */ (null));
  const [detail, setDetail] = useState(/** @type {any} */ (null));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, yRes, dRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/budgets`, { credentials: "include" }),
        fetch(`/api/projects/${projectId}/org-financial-years?page=1&pageSize=50`, {
          credentials: "include",
        }),
        fetch(`/api/projects/${projectId}/org-departments?page=1&pageSize=100`, {
          credentials: "include",
        }),
      ]);
      const bData = await bRes.json().catch(() => ({}));
      const yData = await yRes.json().catch(() => ({}));
      const dData = await dRes.json().catch(() => ({}));
      if (!bRes.ok) {
        showToast({
          message: typeof bData.error === "string" ? bData.error : "Could not load budgets.",
          severity: "error",
        });
        return;
      }
      setBudgets(Array.isArray(bData.budgets) ? bData.budgets : []);
      setYears(Array.isArray(yData.financialYears) ? yData.financialYears : []);
      setDepartments(
        (Array.isArray(dData.departments) ? dData.departments : []).filter(
          (d) => !d.parentId && d.isActive !== false,
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  const loadDetail = useCallback(
    async (budgetId) => {
      if (!budgetId) {
        setDetail(null);
        return;
      }
      const res = await fetch(`/api/projects/${projectId}/budgets/${budgetId}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not load budget.",
          severity: "error",
        });
        return;
      }
      setDetail(data);
    },
    [projectId, showToast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function createBudget(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budgets`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not create budget.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Budget created.", severity: "success" });
      setForm({
        title: "",
        description: "",
        financialYearId: form.financialYearId,
        departmentId: form.departmentId,
        lines: [emptyLine()],
      });
      await load();
      if (data.budget?.id) setSelectedId(data.budget.id);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status) {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budgets/${selectedId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setStatus", status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not update status.",
          severity: "error",
        });
        return;
      }
      showToast({ message: `Budget marked ${status}.`, severity: "success" });
      await load();
      await loadDetail(selectedId);
    } finally {
      setBusy(false);
    }
  }

  function updateLine(idx, patch) {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((line, i) => (i === idx ? { ...line, ...patch } : line)),
    }));
  }

  const statusColor = (s) => {
    if (s === "APPROVED") return "success";
    if (s === "SUBMITTED") return "info";
    if (s === "CLOSED") return "default";
    return "warning";
  };

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy>
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <div className="space-y-4">
      {readOnly ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography sx={adminMutedTextSx}>
            This is a configuration view. Department Users prepare budgets under Procurement → Department
            Budgets. Approvals run through My Tasks (Head User Department → Finance/Budget Officer →
            Accounting Officer). You may close an approved budget if housekeeping is required.
          </Typography>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Create budget
          </Typography>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={createBudget} noValidate>
            <TextField
              label="Title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              fullWidth
              sx={themedTextFieldSx}
              className="sm:col-span-2"
            />
            <TextField
              select
              label="Financial year"
              value={form.financialYearId}
              onChange={(e) => setForm((f) => ({ ...f, financialYearId: e.target.value }))}
              fullWidth
              sx={themedTextFieldSx}
            >
              {years.map((y) => (
                <MenuItem key={y.id} value={y.id}>
                  {y.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Department / unit"
              value={form.departmentId}
              onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
              fullWidth
              sx={themedTextFieldSx}
            >
              <MenuItem value="">Organisation-wide</MenuItem>
              {departments.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))}
            </TextField>
            <div className="sm:col-span-2">
              <Button type="submit" variant="contained" disabled={busy} startIcon={<AddRounded />}>
                {busy ? "Saving…" : "Create budget"}
              </Button>
            </div>
          </form>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Budgets
          </Typography>
          <Button startIcon={<RefreshRounded />} variant="outlined" size="small" onClick={() => load()}>
            Refresh
          </Button>
        </div>
        {budgets.length === 0 ? (
          <Typography sx={adminMutedTextSx}>No budgets yet.</Typography>
        ) : (
          <ul className="space-y-2">
            {budgets.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className={`w-full cursor-pointer rounded-lg border p-3 text-left ${
                    selectedId === b.id
                      ? "border-primary bg-[color:var(--nav-active-bg)]"
                      : "border-[color:var(--border-subtle)]"
                  }`}
                  onClick={() => setSelectedId(b.id)}
                  title={`Open ${b.title}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{b.title}</span>
                    <Chip size="small" color={statusColor(b.status)} label={b.status} />
                    <span className="text-sm text-zinc-500">
                      {b.financialYear?.label}
                      {b.department?.name ? ` · ${b.department.name}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">
                    Total approved UGX {b.totals?.approvedAmount} · Remaining UGX{" "}
                    {b.totals?.remainingAmount} · {b.totals?.lineCount} line(s)
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Paper>

      {detail?.budget ? (
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            {detail.budget.title}
          </Typography>
          <div className="mb-3 flex flex-wrap gap-2">
            <Chip size="small" color={statusColor(detail.budget.status)} label={detail.budget.status} />
            {detail.budget.status === "APPROVED" ? (
              <Button
                size="small"
                color="warning"
                variant="outlined"
                disabled={busy}
                onClick={() => setStatus("CLOSED")}
              >
                Close budget
              </Button>
            ) : null}
          </div>
          <ul className="mb-4 space-y-2 text-sm">
            {(detail.budget.lines || []).map((l) => (
              <li key={l.id} className="rounded border border-[color:var(--border-subtle)] p-2">
                <strong>
                  {l.code} — {l.name}
                </strong>
                <div>
                  Approved UGX {l.approvedAmount} · Committed {l.committedAmount} · Available{" "}
                  {l.availableBalance}
                </div>
                {l.description ? <div className="text-zinc-500">{l.description}</div> : null}
              </li>
            ))}
          </ul>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Audit / history
          </Typography>
          {(detail.audit || []).length === 0 ? (
            <Typography sx={adminMutedTextSx}>No audit entries yet.</Typography>
          ) : (
            <ul className="space-y-1 text-sm">
              {detail.audit.map((a) => (
                <li key={a.id}>
                  {a.eventType} · {String(a.createdAt).slice(0, 19).replace("T", " ")}
                  {a.meta?.previousStatus
                    ? ` · ${a.meta.previousStatus} → ${a.meta.newStatus}`
                    : ""}
                </li>
              ))}
            </ul>
          )}
        </Paper>
      ) : null}
    </div>
  );
}
