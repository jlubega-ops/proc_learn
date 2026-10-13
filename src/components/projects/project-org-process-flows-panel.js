"use client";

import { Fragment, useCallback, useState } from "react";
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
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import KeyboardArrowDownRounded from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowUpRounded from "@mui/icons-material/KeyboardArrowUpRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import UnfoldLessRounded from "@mui/icons-material/UnfoldLessRounded";
import { useToast } from "@/components/providers/toast-provider";
import { useDraftSync } from "@/hooks/use-draft-sync";
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
  validateProjectOrgProcessFlowPatch,
  ENGINE_PROCESS_BINDINGS,
} from "@/lib/validation/project-org-process-flow";
import {
  validateProjectOrgProcessFlowItemInput,
  validateProjectOrgProcessFlowItemPatch,
} from "@/lib/validation/project-org-process-flow-item";
import { isBuiltInProcessCode } from "@/lib/projects/process-catalogue";

/** Max steps the items API returns per page; processes are far shorter in practice. */
const STEPS_PAGE_SIZE = 50;
const COLUMN_COUNT = 6;

function emptyProcessForm() {
  return { name: "", description: "", engineEvent: "" };
}

function emptyItemForm() {
  return { stepNumber: "", taskDescription: "", projectOrgRoleId: "" };
}

/**
 * @template {Record<string, string>} T
 * @param {T} prev
 * @param {Record<string, unknown>} draft
 * @returns {T}
 */
function mergeStringDraft(prev, draft) {
  const next = /** @type {Record<string, string>} */ ({ ...prev });
  for (const k of Object.keys(prev)) {
    if (typeof draft[k] === "string") next[k] = /** @type {string} */ (draft[k]);
  }
  return /** @type {T} */ (next);
}

/**
 * @typedef {{ rows: any[]; total: number; loading: boolean; refetching: boolean; loaded: boolean }} StepsState
 */

/**
 * @param {{ apiBase: string }} p
 */
export function ProjectProcessFlowsPanel({ apiBase }) {
  const { showToast } = useToast();
  const [processPage, setProcessPage] = useState(0);
  const [processRowsPerPage, setProcessRowsPerPage] = useState(10);

  const processQuery = new URLSearchParams({
    page: String(processPage + 1),
    pageSize: String(processRowsPerPage),
  });
  const {
    data: processData,
    loading: processLoading,
    refreshing: processRefetching,
    reload: reloadProcesses,
  } = useApi(`${apiBase}?${processQuery.toString()}`, { errorMessage: "Could not load processes." });
  const processRows = Array.isArray(processData?.processFlows) ? processData.processFlows : [];
  const processTotal = Number(processData?.total) || 0;
  const canManage = processData?.canManage === true;
  const readOnly = !canManage;
  const engineBindings =
    Array.isArray(processData?.engineBindings) && processData.engineBindings.length
      ? processData.engineBindings
      : ENGINE_PROCESS_BINDINGS;

  const [expanded, setExpanded] = useState(/** @type {Record<string, boolean>} */ ({}));
  const [steps, setSteps] = useState(/** @type {Record<string, StepsState>} */ ({}));
  const [assignableRoles, setAssignableRoles] = useState(
    /** @type {{ id: string; name: string }[]} */ ([]),
  );

  const [editProcessRow, setEditProcessRow] = useState(/** @type {any} */ (null));
  const editBuiltIn = isBuiltInProcessCode(editProcessRow?.code);
  const [editProcessForm, setEditProcessForm] = useState(emptyProcessForm());
  const [editProcessErrors, setEditProcessErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  );
  const [editProcessBusy, setEditProcessBusy] = useState(false);

  const [delProcessRow, setDelProcessRow] = useState(/** @type {any} */ (null));
  const [deleteProcessBusy, setDeleteProcessBusy] = useState(false);

  const [createItemProcess, setCreateItemProcess] = useState(/** @type {any} */ (null));
  const [createItemBusy, setCreateItemBusy] = useState(false);
  const [createItemForm, setCreateItemForm] = useState(emptyItemForm());
  const [createItemErrors, setCreateItemErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  );

  const [editItem, setEditItem] = useState(
    /** @type {{ process: any; row: any } | null} */ (null),
  );
  const [editItemForm, setEditItemForm] = useState(emptyItemForm());
  const [editItemErrors, setEditItemErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [editItemBusy, setEditItemBusy] = useState(false);

  const [delItem, setDelItem] = useState(/** @type {{ process: any; row: any } | null} */ (null));
  const [deleteItemBusy, setDeleteItemBusy] = useState(false);

  const editProcessDraft = useDraftSync(
    editProcessRow ? `process-flows:${apiBase}:process:${editProcessRow.id}` : "",
    editProcessForm,
    (d) => setEditProcessForm((f) => mergeStringDraft(f, d)),
    { enabled: Boolean(editProcessRow), resetKey: editProcessRow?.id },
  );

  const createItemDraft = useDraftSync(
    createItemProcess ? `process-flows:${apiBase}:step:new:${createItemProcess.id}` : "",
    createItemForm,
    (d) => setCreateItemForm((f) => mergeStringDraft(f, d)),
    { enabled: Boolean(createItemProcess), resetKey: createItemProcess?.id },
  );

  const editItemDraft = useDraftSync(
    editItem ? `process-flows:${apiBase}:step:${editItem.row.id}` : "",
    editItemForm,
    (d) => setEditItemForm((f) => mergeStringDraft(f, d)),
    { enabled: Boolean(editItem), resetKey: editItem?.row?.id },
  );

  function closeEditProcess() {
    if (editProcessBusy) return;
    editProcessDraft.clearDraft();
    setEditProcessRow(null);
  }

  function closeCreateItem() {
    if (createItemBusy) return;
    createItemDraft.clearDraft();
    setCreateItemProcess(null);
  }

  function closeEditItem() {
    if (editItemBusy) return;
    editItemDraft.clearDraft();
    setEditItem(null);
  }

  const loadProcesses = useCallback(async () => {
    await reloadProcesses();
    void revalidateApi(apiBase);
  }, [apiBase, reloadProcesses]);

  const loadSteps = useCallback(
    async (processId, opts = /** @type {{ silent?: boolean }} */ ({})) => {
      if (!processId) return;
      const silent = Boolean(opts.silent);
      setSteps((prev) => ({
        ...prev,
        [processId]: {
          rows: prev[processId]?.rows || [],
          total: prev[processId]?.total || 0,
          loaded: prev[processId]?.loaded || false,
          loading: !silent,
          refetching: silent,
        },
      }));
      let next = /** @type {{ rows: any[]; total: number } | null} */ (null);
      try {
        const qp = new URLSearchParams({ page: "1", pageSize: String(STEPS_PAGE_SIZE) });
        const res = await fetch(`${apiBase}/${processId}/items?${qp.toString()}`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast({
            message: typeof data.error === "string" ? data.error : "Could not load process steps.",
            severity: "error",
          });
        } else {
          next = {
            rows: Array.isArray(data.items) ? data.items : [],
            total: Number(data.total) || 0,
          };
          if (Array.isArray(data.assignableRoles)) setAssignableRoles(data.assignableRoles);
        }
      } finally {
        setSteps((prev) => ({
          ...prev,
          [processId]: {
            rows: next ? next.rows : prev[processId]?.rows || [],
            total: next ? next.total : prev[processId]?.total || 0,
            loaded: Boolean(next) || prev[processId]?.loaded || false,
            loading: false,
            refetching: false,
          },
        }));
      }
    },
    [apiBase, showToast],
  );

  function toggleExpanded(row) {
    const open = !expanded[row.id];
    setExpanded((prev) => ({ ...prev, [row.id]: open }));
    if (open && !steps[row.id]?.loaded && !steps[row.id]?.loading) void loadSteps(row.id);
  }

  async function refreshAll() {
    const openIds = Object.keys(expanded).filter((id) => expanded[id]);
    await Promise.all([
      loadProcesses({ silent: true }),
      ...openIds.map((id) => loadSteps(id, { silent: true })),
    ]);
  }

  function openEditProcess(row) {
    setEditProcessRow(row);
    setEditProcessForm({
      name: row.name || "",
      description: row.description || "",
      engineEvent: row.triggerKey || "",
    });
    setEditProcessErrors({});
  }

  async function saveEditProcess() {
    if (!editProcessRow) return;
    const validated = validateProjectOrgProcessFlowPatch(editProcessForm);
    if (!validated.ok) {
      setEditProcessErrors(validated.errors);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }

    setEditProcessBusy(true);
    try {
      const res = await fetch(`${apiBase}/${editProcessRow.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editProcessForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setEditProcessErrors(data.fieldErrors);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save changes.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Process updated.", severity: "success" });
      editProcessDraft.clearDraft();
      setEditProcessRow(null);
      await loadProcesses({ silent: true });
    } finally {
      setEditProcessBusy(false);
    }
  }

  async function deleteProcess() {
    if (!delProcessRow) return;
    setDeleteProcessBusy(true);
    try {
      const res = await fetch(`${apiBase}/${delProcessRow.id}`, {
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
      showToast({ message: "Process deleted.", severity: "success" });
      const id = delProcessRow.id;
      setExpanded((prev) => ({ ...prev, [id]: false }));
      setDelProcessRow(null);
      await loadProcesses({ silent: true });
    } finally {
      setDeleteProcessBusy(false);
    }
  }

  function openCreateItem(process) {
    const rows = steps[process.id]?.rows || [];
    const next = rows.reduce((acc, r) => Math.max(acc, Number(r.stepNumber) || 0), 0) + 1;
    setCreateItemErrors({});
    setCreateItemForm({
      ...emptyItemForm(),
      stepNumber: String(next),
      projectOrgRoleId: assignableRoles[0]?.id || "",
    });
    setCreateItemProcess(process);
  }

  async function createItem() {
    if (!createItemProcess?.id) return;
    const validated = validateProjectOrgProcessFlowItemInput(createItemForm);
    if (!validated.ok) {
      setCreateItemErrors(validated.errors);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }

    setCreateItemBusy(true);
    try {
      const processId = createItemProcess.id;
      const res = await fetch(`${apiBase}/${processId}/items`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createItemForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setCreateItemErrors(data.fieldErrors);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not add process step.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Process step added.", severity: "success" });
      createItemDraft.clearDraft();
      setCreateItemProcess(null);
      setCreateItemForm(emptyItemForm());
      setCreateItemErrors({});
      await Promise.all([loadSteps(processId, { silent: true }), loadProcesses({ silent: true })]);
    } finally {
      setCreateItemBusy(false);
    }
  }

  function openEditItem(process, row) {
    setEditItem({ process, row });
    setEditItemForm({
      stepNumber: String(row.stepNumber ?? ""),
      taskDescription: row.taskDescription || "",
      projectOrgRoleId: row.projectOrgRoleId || "",
    });
    setEditItemErrors({});
  }

  async function saveEditItem() {
    if (!editItem) return;
    const validated = validateProjectOrgProcessFlowItemPatch(editItemForm);
    if (!validated.ok) {
      setEditItemErrors(validated.errors);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }

    setEditItemBusy(true);
    try {
      const processId = editItem.process.id;
      const res = await fetch(`${apiBase}/${processId}/items/${editItem.row.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editItemForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setEditItemErrors(data.fieldErrors);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save changes.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Process step updated.", severity: "success" });
      editItemDraft.clearDraft();
      setEditItem(null);
      await loadSteps(processId, { silent: true });
    } finally {
      setEditItemBusy(false);
    }
  }

  async function deleteItem() {
    if (!delItem) return;
    setDeleteItemBusy(true);
    try {
      const processId = delItem.process.id;
      const res = await fetch(`${apiBase}/${processId}/items/${delItem.row.id}`, {
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
      showToast({ message: "Process step deleted.", severity: "success" });
      setDelItem(null);
      await Promise.all([loadSteps(processId, { silent: true }), loadProcesses({ silent: true })]);
    } finally {
      setDeleteItemBusy(false);
    }
  }

  function renderRoleSelect(value, onChange, error, labelId) {
    return (
      <FormControl fullWidth error={Boolean(error)} sx={themedTextFieldSx}>
        <InputLabel id={labelId}>Required user role</InputLabel>
        <Select
          labelId={labelId}
          label="Required user role"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {assignableRoles.map((role) => (
            <MenuItem key={role.id} value={role.id}>
              {role.name}
            </MenuItem>
          ))}
        </Select>
        {error ? (
          <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
            {error}
          </Typography>
        ) : null}
      </FormControl>
    );
  }

  /** @param {any} process */
  function renderSteps(process) {
    const state = steps[process.id];
    const locked = readOnly || isBuiltInProcessCode(process.code);
    const rows = state?.rows || [];

    if (!state || (state.loading && !state.loaded)) {
      return (
        <Box sx={{ ...adminCenteredLoadingBoxSx, minHeight: 96 }} aria-busy="true">
          <CircularProgress size={28} sx={adminLoadingSpinnerSx} />
        </Box>
      );
    }

    return (
      <Box sx={{ py: 1.5, pl: { xs: 0, sm: 5 }, pr: { xs: 0, sm: 1 } }}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mr: "auto" }}>
            Steps
          </Typography>
          {isBuiltInProcessCode(process.code) ? (
            <Tooltip title="Steps match the workflow engine and cannot be changed">
              <Chip size="small" color="info" label="Fixed steps" />
            </Tooltip>
          ) : null}
          {!locked ? (
            <Button
              size="small"
              variant="contained"
              startIcon={<AddRounded />}
              disabled={state.refetching || assignableRoles.length === 0}
              onClick={() => openCreateItem(process)}
              className="w-full sm:w-auto"
              title="Add process step"
            >
              Add step
            </Button>
          ) : null}
        </div>

        {!locked && assignableRoles.length === 0 ? (
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 1 }}>
            Add organisation roles first.
          </Typography>
        ) : null}

        <Box sx={{ position: "relative" }}>
          <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
            <Table size="small" sx={adminTableSx} aria-label={`Steps for ${process.name}`}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 64 }}>Step</TableCell>
                  <TableCell>Task description</TableCell>
                  <TableCell>Required role</TableCell>
                  {!locked ? <TableCell align="right">Actions</TableCell> : null}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={locked ? 3 : 4} align="center" sx={{ py: 3 }}>
                      <Typography variant="body2" sx={adminMutedTextSx}>
                        No steps yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>{row.stepNumber}</TableCell>
                      <TableCell>{row.taskDescription}</TableCell>
                      <TableCell>{row.requiredRole?.name || "—"}</TableCell>
                      {!locked ? (
                        <TableCell align="right">
                          <Box sx={{ display: "inline-flex", gap: 0.25, whiteSpace: "nowrap" }}>
                            <Tooltip title="Edit step">
                              <IconButton
                                size="small"
                                color="primary"
                                aria-label={`Edit step ${row.stepNumber}`}
                                onClick={() => openEditItem(process, row)}
                              >
                                <EditRounded fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete step">
                              <IconButton
                                size="small"
                                color="error"
                                aria-label={`Delete step ${row.stepNumber}`}
                                onClick={() => setDelItem({ process, row })}
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
          {state.refetching ? <Box sx={adminTableRefetchOverlaySx} aria-hidden /> : null}
        </Box>
        {state.total > rows.length ? (
          <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block", mt: 1 }}>
            Showing first {rows.length} of {state.total} steps.
          </Typography>
        ) : null}
      </Box>
    );
  }

  if (processLoading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy="true" aria-label="Loading process flows">
        <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  const anyExpanded = Object.values(expanded).some(Boolean);

  return (
    <div className="space-y-4">
      <Paper
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2, ...adminOutlinedTableContainerSx }}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mr: "auto" }}>
            Processes
          </Typography>
          {anyExpanded ? (
            <Button
              variant="outlined"
              startIcon={<UnfoldLessRounded />}
              onClick={() => setExpanded({})}
              className="w-full sm:w-auto"
              title="Collapse all processes"
            >
              Collapse all
            </Button>
          ) : null}
          <Button
            variant="outlined"
            startIcon={processRefetching ? <CircularProgress size={16} /> : <RefreshRounded />}
            disabled={processRefetching}
            onClick={() => void refreshAll()}
            className="w-full sm:w-auto"
            title="Refresh processes"
          >
            Refresh
          </Button>
        </div>

        <Box sx={{ position: "relative" }}>
          <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
            <Table size="small" sx={adminTableSx}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 48 }} />
                  <TableCell>Process name</TableCell>
                  <TableCell>Engine event</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Steps</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {processRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={COLUMN_COUNT} align="center" sx={{ py: 5 }}>
                      <Typography variant="body2" sx={adminMutedTextSx}>
                        No processes yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  processRows.map((row) => {
                    const open = Boolean(expanded[row.id]);
                    const binding = engineBindings.find((b) => b.triggerKey === row.triggerKey);
                    const stepsId = `process-steps-${row.id}`;
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          hover
                          selected={open}
                          onClick={() => toggleExpanded(row)}
                          sx={{ cursor: "pointer", "& > td": { borderBottom: open ? "none" : undefined } }}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Tooltip title={open ? "Hide steps" : "Show steps"}>
                              <IconButton
                                size="small"
                                color="info"
                                aria-label={`${open ? "Hide" : "Show"} steps for ${row.name}`}
                                aria-expanded={open}
                                aria-controls={stepsId}
                                onClick={() => toggleExpanded(row)}
                              >
                                {open ? (
                                  <KeyboardArrowUpRounded fontSize="small" />
                                ) : (
                                  <KeyboardArrowDownRounded fontSize="small" />
                                )}
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={{ fontWeight: open ? 600 : 400 }}>{row.name}</TableCell>
                          <TableCell>
                            {binding ? (
                              <span title={row.triggerKey || undefined}>
                                {binding.label}
                                {row.code ? ` · ${row.code}` : ""}
                              </span>
                            ) : (
                              <span style={{ opacity: 0.7 }}>Not wired</span>
                            )}
                          </TableCell>
                          <TableCell>{row.description || "—"}</TableCell>
                          <TableCell align="right">{row.itemCount ?? 0}</TableCell>
                          <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                            {!readOnly ? (
                              <Box sx={{ display: "inline-flex", gap: 0.25, whiteSpace: "nowrap" }}>
                                <Tooltip title="Edit process">
                                  <IconButton
                                    size="small"
                                    color="primary"
                                    aria-label={`Edit ${row.name}`}
                                    onClick={() => openEditProcess(row)}
                                  >
                                    <EditRounded fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                {isBuiltInProcessCode(row.code) ? null : (
                                  <Tooltip title="Delete process">
                                    <IconButton
                                      size="small"
                                      color="error"
                                      aria-label={`Delete ${row.name}`}
                                      onClick={() => setDelProcessRow(row)}
                                    >
                                      <DeleteOutlineRounded fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell
                            colSpan={COLUMN_COUNT}
                            sx={{ py: 0, ...(open ? {} : { borderBottom: "none" }) }}
                          >
                            <Collapse in={open} timeout="auto" unmountOnExit>
                              <div id={stepsId}>{renderSteps(row)}</div>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {processRefetching ? <Box sx={adminTableRefetchOverlaySx} aria-hidden /> : null}
        </Box>

        <TablePagination
          component="div"
          count={processTotal}
          page={processPage}
          onPageChange={(_e, p) => setProcessPage(p)}
          rowsPerPage={processRowsPerPage}
          onRowsPerPageChange={(e) => {
            setProcessRowsPerPage(parseInt(e.target.value, 10));
            setProcessPage(0);
          }}
          rowsPerPageOptions={[5, 10, 25]}
        />
      </Paper>

      <Dialog
        open={Boolean(editProcessRow)}
        onClose={closeEditProcess}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Edit process</DialogTitle>
        <DialogContent>
          <Box component="form" noValidate sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField
              label="Process name"
              value={editProcessForm.name}
              onChange={(e) => setEditProcessForm((f) => ({ ...f, name: e.target.value }))}
              error={Boolean(editProcessErrors.name)}
              helperText={editProcessErrors.name || "Display label only"}
              fullWidth
              sx={themedTextFieldSx}
            />
            <TextField
              select
              label="Engine event (optional)"
              value={editProcessForm.engineEvent}
              onChange={(e) => setEditProcessForm((f) => ({ ...f, engineEvent: e.target.value }))}
              disabled={editBuiltIn}
              error={Boolean(editProcessErrors.engineEvent)}
              helperText={editProcessErrors.engineEvent || "One process per event"}
              fullWidth
              sx={themedTextFieldSx}
            >
              <MenuItem value="">Not wired (educational)</MenuItem>
              {engineBindings.map((b) => (
                <MenuItem key={b.triggerKey} value={b.triggerKey}>
                  {b.label} — {b.triggerKey}
                </MenuItem>
              ))}
            </TextField>
            {editProcessForm.engineEvent ? (
              <Typography variant="body2" sx={adminMutedTextSx}>
                Auto: code{" "}
                <strong>
                  {engineBindings.find((b) => b.triggerKey === editProcessForm.engineEvent)?.code ||
                    "—"}
                </strong>
                , trigger <strong>{editProcessForm.engineEvent}</strong>.
              </Typography>
            ) : null}
            <TextField
              label="Description (optional)"
              value={editProcessForm.description}
              onChange={(e) => setEditProcessForm((f) => ({ ...f, description: e.target.value }))}
              disabled={editBuiltIn}
              error={Boolean(editProcessErrors.description)}
              helperText={editProcessErrors.description || ""}
              fullWidth
              multiline
              minRows={2}
              sx={themedTextFieldSx}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeEditProcess} disabled={editProcessBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void saveEditProcess()}
            disabled={editProcessBusy}
            startIcon={editProcessBusy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {editProcessBusy ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(delProcessRow)}
        onClose={() => !deleteProcessBusy && setDelProcessRow(null)}
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Delete process?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete <strong>{delProcessRow?.name}</strong> and all of its steps? This cannot be
            undone.
            {delProcessRow?.triggerKey
              ? ` Bound to ${delProcessRow.triggerKey} — organisations using it will need another process wired to that event.`
              : ""}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDelProcessRow(null)} disabled={deleteProcessBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => void deleteProcess()}
            disabled={deleteProcessBusy}
            startIcon={deleteProcessBusy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {deleteProcessBusy ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(createItemProcess)}
        onClose={closeCreateItem}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Add step — {createItemProcess?.name}</DialogTitle>
        <DialogContent>
          <Box component="form" noValidate sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField
              label="Process step (number)"
              type="number"
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
              value={createItemForm.stepNumber}
              onChange={(e) => setCreateItemForm((f) => ({ ...f, stepNumber: e.target.value }))}
              error={Boolean(createItemErrors.stepNumber)}
              helperText={createItemErrors.stepNumber || ""}
              fullWidth
              sx={themedTextFieldSx}
            />
            <TextField
              label="Task description"
              placeholder="e.g. Preparation of Procurement Plan"
              value={createItemForm.taskDescription}
              onChange={(e) =>
                setCreateItemForm((f) => ({ ...f, taskDescription: e.target.value }))
              }
              error={Boolean(createItemErrors.taskDescription)}
              helperText={createItemErrors.taskDescription || ""}
              fullWidth
              sx={themedTextFieldSx}
            />
            {renderRoleSelect(
              createItemForm.projectOrgRoleId,
              (value) => setCreateItemForm((f) => ({ ...f, projectOrgRoleId: value })),
              createItemErrors.projectOrgRoleId,
              "create-item-role-label",
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeCreateItem} disabled={createItemBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void createItem()}
            disabled={createItemBusy}
            startIcon={createItemBusy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {createItemBusy ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(editItem)}
        onClose={closeEditItem}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Edit step — {editItem?.process?.name}</DialogTitle>
        <DialogContent>
          <Box component="form" noValidate sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField
              label="Process step (number)"
              type="number"
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
              value={editItemForm.stepNumber}
              onChange={(e) => setEditItemForm((f) => ({ ...f, stepNumber: e.target.value }))}
              error={Boolean(editItemErrors.stepNumber)}
              helperText={editItemErrors.stepNumber || ""}
              fullWidth
              sx={themedTextFieldSx}
            />
            <TextField
              label="Task description"
              value={editItemForm.taskDescription}
              onChange={(e) => setEditItemForm((f) => ({ ...f, taskDescription: e.target.value }))}
              error={Boolean(editItemErrors.taskDescription)}
              helperText={editItemErrors.taskDescription || ""}
              fullWidth
              sx={themedTextFieldSx}
            />
            {renderRoleSelect(
              editItemForm.projectOrgRoleId,
              (value) => setEditItemForm((f) => ({ ...f, projectOrgRoleId: value })),
              editItemErrors.projectOrgRoleId,
              "edit-item-role-label",
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeEditItem} disabled={editItemBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void saveEditItem()}
            disabled={editItemBusy}
            startIcon={editItemBusy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {editItemBusy ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(delItem)}
        onClose={() => !deleteItemBusy && setDelItem(null)}
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Delete process step?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete step <strong>{delItem?.row?.stepNumber}</strong> ({delItem?.row?.taskDescription})?
            This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDelItem(null)} disabled={deleteItemBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => void deleteItem()}
            disabled={deleteItemBusy}
            startIcon={deleteItemBusy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {deleteItemBusy ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
