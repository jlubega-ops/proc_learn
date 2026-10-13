"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Switch from "@mui/material/Switch";
import TablePagination from "@mui/material/TablePagination";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import DoneAllRounded from "@mui/icons-material/DoneAllRounded";
import KeyboardArrowDownRounded from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowUpRounded from "@mui/icons-material/KeyboardArrowUpRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import { useToast } from "@/components/providers/toast-provider";
import { useApi } from "@/hooks/use-api";
import { revalidateApi } from "@/lib/api-client-cache";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableRefetchOverlaySx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";

const API = "/api/programme-processes";

/**
 * @typedef {{ code: string; name: string; summary: string; group: string }} CatalogueProcess
 * @typedef {{ id: string; name: string; shortName: string; isActive: boolean; disabledCodes: string[] }} ProgrammeRow
 * @typedef {{ id: string; label: string; isCurrent: boolean }} YearOption
 * @typedef {{
 *   programme: ProgrammeRow;
 *   code: string;
 *   enabled: boolean;
 *   codes: string[];
 *   names: string[];
 *   students: number;
 *   projects: number;
 *   inFlight: number;
 * }} PendingToggle
 */

/** @param {Response} res @param {string} fallback */
async function errorOf(res, fallback) {
  const json = await res.json().catch(() => ({}));
  return typeof json.error === "string" ? json.error : fallback;
}

/** Programme × academic year process switches (system admin and examiner). */
export function ProgrammeProcessesPanel() {
  const { showToast } = useToast();
  const [yearId, setYearId] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [expanded, setExpanded] = useState(/** @type {Record<string, boolean>} */ ({}));
  const [busyKey, setBusyKey] = useState(/** @type {string | null} */ (null));
  const [pending, setPending] = useState(/** @type {PendingToggle | null} */ (null));
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [copyFor, setCopyFor] = useState(/** @type {ProgrammeRow | null} */ (null));
  const [copyFrom, setCopyFrom] = useState("");
  const [copyError, setCopyError] = useState("");
  const [copyBusy, setCopyBusy] = useState(false);
  const [enableAllFor, setEnableAllFor] = useState(/** @type {ProgrammeRow | null} */ (null));
  const [enableAllBusy, setEnableAllBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listParams = new URLSearchParams({
    page: String(page + 1),
    pageSize: String(rowsPerPage),
  });
  if (yearId) listParams.set("academicYearId", yearId);
  if (search) listParams.set("q", search);
  if (includeInactive) listParams.set("includeInactive", "1");
  const {
    data: listData,
    loading,
    refreshing: refetching,
    reload,
    mutate,
  } = useApi(`${API}?${listParams.toString()}`, { errorMessage: "Could not load programmes." });
  const years = /** @type {YearOption[]} */ (
    Array.isArray(listData?.academicYears) ? listData.academicYears : []
  );
  const year = /** @type {YearOption | null} */ (listData?.academicYear || null);
  const catalogue = /** @type {CatalogueProcess[]} */ (
    Array.isArray(listData?.catalogue) ? listData.catalogue : []
  );
  const groups = /** @type {Record<string, string>} */ (
    listData?.groups && typeof listData.groups === "object" ? listData.groups : {}
  );
  const rows = /** @type {ProgrammeRow[]} */ (
    Array.isArray(listData?.programmes) ? listData.programmes : []
  );
  const total = Number(listData?.total) || 0;
  const activeYearId = year?.id || "";
  const processCount = catalogue.length;
  const groupKeys = Object.keys(groups).filter((g) => catalogue.some((p) => p.group === g));

  /** @param {string} programmeId @param {string[]} disabledCodes */
  function patchRow(programmeId, disabledCodes) {
    void mutate(
      (prev) =>
        prev && Array.isArray(prev.programmes)
          ? {
              ...prev,
              programmes: prev.programmes.map((r) =>
                r.id === programmeId ? { ...r, disabledCodes } : r,
              ),
            }
          : prev,
      { revalidate: false },
    );
    void revalidateApi(API);
  }

  /** @param {ProgrammeRow} programme @param {string} code @param {boolean} enabled */
  async function requestToggle(programme, code, enabled) {
    if (!activeYearId) return;
    const key = `${programme.id}:${code}`;
    setBusyKey(key);
    try {
      const params = new URLSearchParams({
        programmeId: programme.id,
        academicYearId: activeYearId,
        code,
        enabled: enabled ? "1" : "0",
      });
      const res = await fetch(`${API}/impact?${params}`, { credentials: "include" });
      if (!res.ok) {
        showToast({ message: await errorOf(res, "Could not check this change."), severity: "error" });
        return;
      }
      const impact = await res.json();
      const codes = Array.isArray(impact.codes) ? impact.codes : [];
      if (!codes.length) return;
      if (enabled && codes.length === 1) {
        await applyToggle({ programme, code, enabled, codes, names: impact.names || [], students: 0, projects: 0, inFlight: 0 });
        return;
      }
      setPending({
        programme,
        code,
        enabled,
        codes,
        names: Array.isArray(impact.names) ? impact.names : [],
        students: Number(impact.students) || 0,
        projects: Number(impact.projects) || 0,
        inFlight: Number(impact.inFlight) || 0,
      });
    } finally {
      setBusyKey(null);
    }
  }

  /** @param {PendingToggle} change */
  async function applyToggle(change) {
    const key = `${change.programme.id}:${change.code}`;
    setBusyKey(key);
    try {
      const res = await fetch(API, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programmeId: change.programme.id,
          academicYearId: activeYearId,
          code: change.code,
          enabled: change.enabled,
        }),
      });
      if (!res.ok) {
        showToast({ message: await errorOf(res, "Could not update process."), severity: "error" });
        return false;
      }
      const json = await res.json();
      patchRow(change.programme.id, Array.isArray(json.disabledCodes) ? json.disabledCodes : []);
      const label = change.names.length ? change.names.join(", ") : change.code;
      showToast({
        message: `${label} ${change.enabled ? "enabled" : "disabled"} for ${change.programme.shortName || change.programme.name}.`,
        severity: "success",
      });
      return true;
    } finally {
      setBusyKey(null);
    }
  }

  async function confirmPending() {
    if (!pending) return;
    setConfirmBusy(true);
    try {
      const ok = await applyToggle(pending);
      if (ok) setPending(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  async function confirmEnableAll() {
    if (!enableAllFor) return;
    setEnableAllBusy(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enable_all", programmeId: enableAllFor.id, academicYearId: activeYearId }),
      });
      if (!res.ok) {
        showToast({ message: await errorOf(res, "Could not enable processes."), severity: "error" });
        return;
      }
      const json = await res.json();
      patchRow(enableAllFor.id, Array.isArray(json.disabledCodes) ? json.disabledCodes : []);
      showToast({ message: "All processes enabled.", severity: "success" });
      setEnableAllFor(null);
    } finally {
      setEnableAllBusy(false);
    }
  }

  async function confirmCopy() {
    if (!copyFor) return;
    if (!copyFrom) {
      setCopyError("Choose a year.");
      return;
    }
    setCopyBusy(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "copy_from",
          programmeId: copyFor.id,
          academicYearId: activeYearId,
          fromAcademicYearId: copyFrom,
        }),
      });
      if (!res.ok) {
        showToast({ message: await errorOf(res, "Could not copy settings."), severity: "error" });
        return;
      }
      const json = await res.json();
      patchRow(copyFor.id, Array.isArray(json.disabledCodes) ? json.disabledCodes : []);
      showToast({ message: "Settings copied.", severity: "success" });
      setCopyFor(null);
    } finally {
      setCopyBusy(false);
    }
  }

  const otherYears = years.filter((y) => y.id !== activeYearId);

  return (
    <Paper
      variant="outlined"
      sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2, ...adminOutlinedTableContainerSx, position: "relative" }}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <FormControl sx={{ minWidth: 180, ...themedTextFieldSx }} className="w-full sm:w-auto">
          <InputLabel id="pp-year">Academic year</InputLabel>
          <Select
            labelId="pp-year"
            label="Academic year"
            value={years.some((y) => y.id === yearId) ? yearId : ""}
            onChange={(e) => {
              setYearId(String(e.target.value));
              setPage(0);
            }}
          >
            {years.map((y) => (
              <MenuItem key={y.id} value={y.id}>
                {y.label}
                {y.isCurrent ? " (current)" : ""}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Search programmes"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={themedTextFieldSx}
          className="w-full sm:w-64"
          slotProps={{ input: { startAdornment: <SearchRounded fontSize="small" sx={{ mr: 1 }} /> } }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={includeInactive}
              onChange={(e) => {
                setIncludeInactive(e.target.checked);
                setPage(0);
              }}
            />
          }
          label="Include inactive"
        />
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {year && !year.isCurrent ? (
            <Tooltip title="Changes still apply to this year">
              <Chip size="small" color="warning" label="Past year" />
            </Tooltip>
          ) : null}
          <Button
            variant="outlined"
            startIcon={refetching ? <CircularProgress size={16} /> : <RefreshRounded />}
            disabled={refetching || loading}
            onClick={() => void reload()}
            className="w-full sm:w-auto"
            title="Refresh programmes"
          >
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
          <CircularProgress sx={adminLoadingSpinnerSx} />
          <Typography variant="body2" sx={{ mt: 1 }}>
            Loading programmes…
          </Typography>
        </Box>
      ) : !years.length ? (
        <Typography variant="body2" sx={adminMutedTextSx}>
          No academic years yet.
        </Typography>
      ) : rows.length === 0 ? (
        <Typography variant="body2" sx={adminMutedTextSx}>
          No programmes found.
        </Typography>
      ) : (
        <Box component="ul" sx={{ display: "flex", flexDirection: "column", gap: 1, p: 0, m: 0, listStyle: "none" }}>
          {rows.map((programme) => {
            const open = Boolean(expanded[programme.id]);
            const disabledSet = new Set(programme.disabledCodes);
            const onCount = processCount - catalogue.filter((p) => disabledSet.has(p.code)).length;
            const allOn = onCount === processCount;
            return (
              <Box
                component="li"
                key={programme.id}
                sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, bgcolor: "background.paper" }}
              >
                <div className="flex flex-wrap items-center gap-2 p-2 sm:flex-nowrap">
                  <Tooltip title={open ? "Hide processes" : "Show processes"}>
                    <IconButton
                      aria-expanded={open}
                      aria-controls={`pp-${programme.id}`}
                      aria-label={`${open ? "Hide" : "Show"} processes for ${programme.name}`}
                      onClick={() => setExpanded((p) => ({ ...p, [programme.id]: !open }))}
                    >
                      {open ? <KeyboardArrowUpRounded /> : <KeyboardArrowDownRounded />}
                    </IconButton>
                  </Tooltip>
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer text-left"
                    onClick={() => setExpanded((p) => ({ ...p, [programme.id]: !open }))}
                  >
                    <span className="block truncate font-semibold text-foreground">{programme.name}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{programme.shortName}</span>
                  </button>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!programme.isActive ? <Chip size="small" color="error" variant="outlined" label="Inactive" /> : null}
                    <Chip
                      size="small"
                      color={allOn ? "success" : "warning"}
                      variant="outlined"
                      label={`${onCount}/${processCount} on`}
                    />
                  </div>
                  <div className="flex flex-nowrap items-center">
                    <Tooltip title="Enable all processes">
                      <span>
                        <IconButton
                          color="primary"
                          aria-label={`Enable all processes for ${programme.name}`}
                          disabled={allOn}
                          onClick={() => setEnableAllFor(programme)}
                        >
                          <DoneAllRounded fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Copy from another year">
                      <span>
                        <IconButton
                          color="info"
                          aria-label={`Copy settings for ${programme.name} from another year`}
                          disabled={!otherYears.length}
                          onClick={() => {
                            setCopyFor(programme);
                            setCopyFrom("");
                            setCopyError("");
                          }}
                        >
                          <ContentCopyRounded fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </div>
                </div>
                <Collapse in={open} timeout="auto" unmountOnExit>
                  <div id={`pp-${programme.id}`} className="space-y-4 border-t border-[color:var(--border-subtle)] p-3">
                    {groupKeys.map((groupKey) => (
                      <div key={groupKey}>
                        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-primary">
                          {groups[groupKey]}
                        </h3>
                        <ul className="divide-y divide-[color:var(--border-subtle)]">
                          {catalogue
                            .filter((p) => p.group === groupKey)
                            .map((p) => {
                              const on = !disabledSet.has(p.code);
                              const busy = busyKey === `${programme.id}:${p.code}`;
                              return (
                                <li key={p.code} className="flex items-center gap-3 py-2">
                                  <div className="min-w-0 flex-1">
                                    <span className="font-medium text-foreground">{p.name}</span>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{p.summary}</p>
                                  </div>
                                  {busy ? (
                                    <CircularProgress size={18} sx={{ mx: 1.5 }} aria-label="Updating" />
                                  ) : (
                                    <Tooltip title={on ? `Disable ${p.name}` : `Enable ${p.name}`}>
                                      <span>
                                        <Switch
                                          checked={on}
                                          color="success"
                                          disabled={Boolean(busyKey)}
                                          onChange={(e) => void requestToggle(programme, p.code, e.target.checked)}
                                          slotProps={{
                                            input: { "aria-label": `${p.name} for ${programme.name}: ${on ? "on" : "off"}` },
                                          }}
                                        />
                                      </span>
                                    </Tooltip>
                                  )}
                                </li>
                              );
                            })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Collapse>
              </Box>
            );
          })}
        </Box>
      )}

      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_e, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[5, 10, 25]}
      />
      {refetching ? <Box sx={adminTableRefetchOverlaySx} aria-hidden /> : null}

      <Dialog
        open={Boolean(pending)}
        onClose={() => (confirmBusy ? null : setPending(null))}
        fullWidth
        maxWidth="xs"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>
          {pending?.enabled ? "Enable processes" : `Disable ${pending?.names[0] || "process"}`}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {pending?.programme.name} · {year?.label}
          </Typography>
          <div className="mb-2 flex flex-wrap gap-1">
            {(pending?.names || []).map((n) => (
              <Chip key={n} size="small" color={pending?.enabled ? "primary" : "error"} variant="outlined" label={n} />
            ))}
          </div>
          {pending && !pending.enabled ? (
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                <strong>{pending.students}</strong> students
              </li>
              <li>
                <strong>{pending.projects}</strong> projects
              </li>
              <li>
                <strong>{pending.inFlight}</strong> approvals in progress (paused)
              </li>
            </ul>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
          <Button onClick={() => setPending(null)} disabled={confirmBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={pending?.enabled ? "primary" : "error"}
            onClick={() => void confirmPending()}
            disabled={confirmBusy}
            startIcon={confirmBusy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {confirmBusy
              ? "Saving…"
              : pending?.enabled
                ? `Enable ${pending.codes.length}`
                : `Disable ${pending?.codes.length || 0}`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(enableAllFor)}
        onClose={() => (enableAllBusy ? null : setEnableAllFor(null))}
        fullWidth
        maxWidth="xs"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Enable all processes</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {enableAllFor?.name} · {year?.label}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
          <Button onClick={() => setEnableAllFor(null)} disabled={enableAllBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void confirmEnableAll()}
            disabled={enableAllBusy}
            startIcon={enableAllBusy ? <CircularProgress size={16} color="inherit" /> : <DoneAllRounded />}
          >
            {enableAllBusy ? "Saving…" : "Enable all"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(copyFor)}
        onClose={() => (copyBusy ? null : setCopyFor(null))}
        fullWidth
        maxWidth="xs"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Copy from another year</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {copyFor?.name} · into {year?.label}
          </Typography>
          <FormControl fullWidth error={Boolean(copyError)} sx={themedTextFieldSx}>
            <InputLabel id="pp-copy-year">From year</InputLabel>
            <Select
              labelId="pp-copy-year"
              label="From year"
              value={copyFrom}
              onChange={(e) => {
                setCopyFrom(String(e.target.value));
                setCopyError("");
              }}
            >
              {otherYears.map((y) => (
                <MenuItem key={y.id} value={y.id}>
                  {y.label}
                </MenuItem>
              ))}
            </Select>
            {copyError ? (
              <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                {copyError}
              </Typography>
            ) : null}
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
          <Button onClick={() => setCopyFor(null)} disabled={copyBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void confirmCopy()}
            disabled={copyBusy}
            startIcon={copyBusy ? <CircularProgress size={16} color="inherit" /> : <ContentCopyRounded />}
          >
            {copyBusy ? "Copying…" : "Copy"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
