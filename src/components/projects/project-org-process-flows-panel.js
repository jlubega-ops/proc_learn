"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
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
import ListAltRounded from "@mui/icons-material/ListAltRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { useToast } from "@/components/providers/toast-provider";
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
  validateProjectOrgProcessFlowInput,
  validateProjectOrgProcessFlowPatch,
  ENGINE_PROCESS_BINDINGS,
} from "@/lib/validation/project-org-process-flow";
import {
  validateProjectOrgProcessFlowItemInput,
  validateProjectOrgProcessFlowItemPatch,
} from "@/lib/validation/project-org-process-flow-item";

function emptyProcessForm() {
  return { name: "", description: "", engineEvent: "" };
}

function emptyItemForm() {
  return { stepNumber: "", taskDescription: "", projectOrgRoleId: "" };
}

/**
 * @param {{ apiBase: string }} p
 */
export function ProjectProcessFlowsPanel({ apiBase }) {
  const { showToast } = useToast();
  const [canManage, setCanManage] = useState(false);
  const readOnly = !canManage;

  const [processRows, setProcessRows] = useState(/** @type {any[]} */ ([]));
  const [processLoading, setProcessLoading] = useState(true);
  const [processRefetching, setProcessRefetching] = useState(false);
  const [processPage, setProcessPage] = useState(0);
  const [processRowsPerPage, setProcessRowsPerPage] = useState(10);
  const [processTotal, setProcessTotal] = useState(0);

  const [selectedProcess, setSelectedProcess] = useState(/** @type {any} */ (null));

  const [itemRows, setItemRows] = useState(/** @type {any[]} */ ([]));
  const [assignableRoles, setAssignableRoles] = useState(
    /** @type {{ id: string; name: string }[]} */ ([]),
  );
  const [itemLoading, setItemLoading] = useState(false);
  const [itemRefetching, setItemRefetching] = useState(false);
  const [itemPage, setItemPage] = useState(0);
  const [itemRowsPerPage, setItemRowsPerPage] = useState(10);
  const [itemTotal, setItemTotal] = useState(0);

  const [openCreateProcess, setOpenCreateProcess] = useState(false);
  const [createProcessBusy, setCreateProcessBusy] = useState(false);
  const [createProcessForm, setCreateProcessForm] = useState(emptyProcessForm());
  const [createProcessErrors, setCreateProcessErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  );

  const [editProcessRow, setEditProcessRow] = useState(/** @type {any} */ (null));
  const [editProcessForm, setEditProcessForm] = useState(emptyProcessForm());
  const [editProcessErrors, setEditProcessErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  );
  const [editProcessBusy, setEditProcessBusy] = useState(false);

  const [delProcessRow, setDelProcessRow] = useState(/** @type {any} */ (null));
  const [deleteProcessBusy, setDeleteProcessBusy] = useState(false);

  const [openCreateItem, setOpenCreateItem] = useState(false);
  const [createItemBusy, setCreateItemBusy] = useState(false);
  const [createItemForm, setCreateItemForm] = useState(emptyItemForm());
  const [createItemErrors, setCreateItemErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  );

  const [editItemRow, setEditItemRow] = useState(/** @type {any} */ (null));
  const [editItemForm, setEditItemForm] = useState(emptyItemForm());
  const [editItemErrors, setEditItemErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [editItemBusy, setEditItemBusy] = useState(false);

  const [delItemRow, setDelItemRow] = useState(/** @type {any} */ (null));
  const [deleteItemBusy, setDeleteItemBusy] = useState(false);
  const [engineBindings, setEngineBindings] = useState(ENGINE_PROCESS_BINDINGS);

  const loadProcesses = useCallback(
    async (opts = /** @type {{ silent?: boolean }} */ ({})) => {
      const silent = Boolean(opts.silent);
      if (silent) setProcessRefetching(true);
      else setProcessLoading(true);
      try {
        const qp = new URLSearchParams({
          page: String(processPage + 1),
          pageSize: String(processRowsPerPage),
        });
        const res = await fetch(`${apiBase}?${qp.toString()}`, { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast({
            message: typeof data.error === "string" ? data.error : "Could not load processes.",
            severity: "error",
          });
          return;
        }
        const flows = Array.isArray(data.processFlows) ? data.processFlows : [];
        setProcessRows(flows);
        setProcessTotal(Number(data.total) || 0);
        if (typeof data.canManage === "boolean") setCanManage(data.canManage);
        if (Array.isArray(data.engineBindings) && data.engineBindings.length) {
          setEngineBindings(data.engineBindings);
        }
        setSelectedProcess((prev) => {
          if (!prev) return null;
          const match = flows.find((row) => row.id === prev.id);
          return match || null;
        });
      } finally {
        if (silent) setProcessRefetching(false);
        else setProcessLoading(false);
      }
    },
    [apiBase, processPage, processRowsPerPage, showToast],
  );

  const loadItems = useCallback(
    async (processId, opts = /** @type {{ silent?: boolean }} */ ({})) => {
      if (!processId) return;
      const silent = Boolean(opts.silent);
      if (silent) setItemRefetching(true);
      else setItemLoading(true);
      try {
        const qp = new URLSearchParams({
          page: String(itemPage + 1),
          pageSize: String(itemRowsPerPage),
        });
        const res = await fetch(`${apiBase}/${processId}/items?${qp.toString()}`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast({
            message: typeof data.error === "string" ? data.error : "Could not load process steps.",
            severity: "error",
          });
          return;
        }
        setItemRows(Array.isArray(data.items) ? data.items : []);
        setAssignableRoles(Array.isArray(data.assignableRoles) ? data.assignableRoles : []);
        setItemTotal(Number(data.total) || 0);
      } finally {
        if (silent) setItemRefetching(false);
        else setItemLoading(false);
      }
    },
    [apiBase, itemPage, itemRowsPerPage, showToast],
  );

  useEffect(() => {
    void loadProcesses();
  }, [loadProcesses]);

  useEffect(() => {
    if (!selectedProcess?.id) {
      setItemRows([]);
      setItemTotal(0);
      return;
    }
    void loadItems(selectedProcess.id);
  }, [loadItems, selectedProcess?.id]);

  const nextStepNumber = useMemo(() => {
    if (itemRows.length === 0) return 1;
    const max = itemRows.reduce((acc, row) => Math.max(acc, Number(row.stepNumber) || 0), 0);
    return max + 1;
  }, [itemRows]);

  async function createProcess() {
    const validated = validateProjectOrgProcessFlowInput(createProcessForm);
    if (!validated.ok) {
      setCreateProcessErrors(validated.errors);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }

    setCreateProcessBusy(true);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createProcessForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setCreateProcessErrors(data.fieldErrors);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not create process.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Process created.", severity: "success" });
      setOpenCreateProcess(false);
      setCreateProcessForm(emptyProcessForm());
      setCreateProcessErrors({});
      await loadProcesses({ silent: true });
      if (data.processFlow) setSelectedProcess(data.processFlow);
    } finally {
      setCreateProcessBusy(false);
    }
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
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not delete.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Process deleted.", severity: "success" });
      if (selectedProcess?.id === delProcessRow.id) setSelectedProcess(null);
      setDelProcessRow(null);
      await loadProcesses({ silent: true });
    } finally {
      setDeleteProcessBusy(false);
    }
  }

  async function createItem() {
    if (!selectedProcess?.id) return;
    const validated = validateProjectOrgProcessFlowItemInput(createItemForm);
    if (!validated.ok) {
      setCreateItemErrors(validated.errors);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }

    setCreateItemBusy(true);
    try {
      const res = await fetch(`${apiBase}/${selectedProcess.id}/items`, {
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
      setOpenCreateItem(false);
      setCreateItemForm(emptyItemForm());
      setCreateItemErrors({});
      await Promise.all([
        loadItems(selectedProcess.id, { silent: true }),
        loadProcesses({ silent: true }),
      ]);
    } finally {
      setCreateItemBusy(false);
    }
  }

  function openEditItem(row) {
    setEditItemRow(row);
    setEditItemForm({
      stepNumber: String(row.stepNumber ?? ""),
      taskDescription: row.taskDescription || "",
      projectOrgRoleId: row.projectOrgRoleId || "",
    });
    setEditItemErrors({});
  }

  async function saveEditItem() {
    if (!editItemRow || !selectedProcess?.id) return;
    const validated = validateProjectOrgProcessFlowItemPatch(editItemForm);
    if (!validated.ok) {
      setEditItemErrors(validated.errors);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }

    setEditItemBusy(true);
    try {
      const res = await fetch(`${apiBase}/${selectedProcess.id}/items/${editItemRow.id}`, {
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
      setEditItemRow(null);
      await loadItems(selectedProcess.id, { silent: true });
    } finally {
      setEditItemBusy(false);
    }
  }

  async function deleteItem() {
    if (!delItemRow || !selectedProcess?.id) return;
    setDeleteItemBusy(true);
    try {
      const res = await fetch(`${apiBase}/${selectedProcess.id}/items/${delItemRow.id}`, {
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
      showToast({ message: "Process step deleted.", severity: "success" });
      setDelItemRow(null);
      await Promise.all([
        loadItems(selectedProcess.id, { silent: true }),
        loadProcesses({ silent: true }),
      ]);
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

  if (processLoading) {
    return (
      <Box
        sx={adminCenteredLoadingBoxSx}
        aria-busy="true"
        aria-label="Loading process flows"
      >
        <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <div className="space-y-4">
      <Paper
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2, ...adminOutlinedTableContainerSx }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Processes
        </Typography>
        <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
          {readOnly
            ? "These process flows are configured by system administrators and shared across all student project workspaces."
            : "Add a process for student organisation workspaces, then define ordered steps with the role responsible for each task."}
        </Typography>

        <div className="mb-3 flex flex-wrap gap-2">
          {!readOnly ? (
            <Button
              variant="contained"
              startIcon={<AddRounded />}
              disabled={processRefetching}
              onClick={() => {
                setCreateProcessErrors({});
                setCreateProcessForm(emptyProcessForm());
                setOpenCreateProcess(true);
              }}
              className="w-full sm:w-auto"
              title="Add process"
            >
              Add process
            </Button>
          ) : null}
          <Button
            variant="outlined"
            startIcon={processRefetching ? <CircularProgress size={16} /> : <RefreshRounded />}
            disabled={processRefetching}
            onClick={() => loadProcesses({ silent: true })}
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
                    <TableCell colSpan={5} align="center" sx={{ py: 5 }}>
                      <Typography variant="body2" sx={adminMutedTextSx}>
                        No processes yet. Add a process to get started.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  processRows.map((row) => {
                    const selected = selectedProcess?.id === row.id;
                    const binding = engineBindings.find((b) => b.triggerKey === row.triggerKey);
                    return (
                      <TableRow
                        key={row.id}
                        hover
                        selected={selected}
                        onClick={() => setSelectedProcess(row)}
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell sx={{ fontWeight: selected ? 600 : 400 }}>{row.name}</TableCell>
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
                          <Box sx={{ display: "inline-flex", gap: 0.25 }}>
                            <Tooltip title="Manage process steps">
                              <IconButton
                                size="small"
                                color="info"
                                aria-label={`Manage steps for ${row.name}`}
                                onClick={() => setSelectedProcess(row)}
                              >
                                <ListAltRounded fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {!readOnly ? (
                              <>
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
                              </>
                            ) : null}
                          </Box>
                        </TableCell>
                      </TableRow>
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

      {selectedProcess ? (
        <Paper
          variant="outlined"
          sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2, ...adminOutlinedTableContainerSx }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
            Process steps — {selectedProcess.name}
          </Typography>
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
            Each step has a number, task description, and the organisation role required to perform
            it. Admin is not listed as a required role.
          </Typography>

          <div className="mb-3 flex flex-wrap gap-2">
            {!readOnly ? (
              <Button
                variant="contained"
                startIcon={<AddRounded />}
                disabled={itemRefetching || itemLoading || assignableRoles.length === 0}
                onClick={() => {
                  setCreateItemErrors({});
                  setCreateItemForm({
                    ...emptyItemForm(),
                    stepNumber: String(nextStepNumber),
                    projectOrgRoleId: assignableRoles[0]?.id || "",
                  });
                  setOpenCreateItem(true);
                }}
                className="w-full sm:w-auto"
                title="Add process step"
              >
                Add process step
              </Button>
            ) : null}
            <Button
              variant="outlined"
              startIcon={itemRefetching ? <CircularProgress size={16} /> : <RefreshRounded />}
              disabled={itemRefetching || itemLoading}
              onClick={() => selectedProcess?.id && loadItems(selectedProcess.id, { silent: true })}
              className="w-full sm:w-auto"
              title="Refresh process steps"
            >
              Refresh
            </Button>
          </div>

          {assignableRoles.length === 0 && !readOnly ? (
            <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
              Add organisation roles under Roles &amp; Permissions before defining process steps.
            </Typography>
          ) : null}

          {itemLoading ? (
            <Box sx={{ ...adminCenteredLoadingBoxSx, minHeight: 160 }} aria-busy="true">
              <CircularProgress size={32} sx={adminLoadingSpinnerSx} />
            </Box>
          ) : (
            <>
              <Box sx={{ position: "relative" }}>
                <TableContainer
                  component={Paper}
                  variant="outlined"
                  sx={adminOutlinedTableContainerSx}
                >
                  <Table size="small" sx={adminTableSx}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Step</TableCell>
                        <TableCell>Task description</TableCell>
                        <TableCell>Required role</TableCell>
                        {!readOnly ? <TableCell align="right">Actions</TableCell> : null}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {itemRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={readOnly ? 3 : 4} align="center" sx={{ py: 5 }}>
                            <Typography variant="body2" sx={adminMutedTextSx}>
                              No steps yet for this process.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        itemRows.map((row) => (
                          <TableRow key={row.id} hover>
                            <TableCell>{row.stepNumber}</TableCell>
                            <TableCell>{row.taskDescription}</TableCell>
                            <TableCell>{row.requiredRole?.name || "—"}</TableCell>
                            {!readOnly ? (
                              <TableCell align="right">
                                <Box sx={{ display: "inline-flex", gap: 0.25 }}>
                                  <Tooltip title="Edit process step">
                                    <IconButton
                                      size="small"
                                      color="primary"
                                      aria-label={`Edit step ${row.stepNumber}`}
                                      onClick={() => openEditItem(row)}
                                    >
                                      <EditRounded fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Delete process step">
                                    <IconButton
                                      size="small"
                                      color="error"
                                      aria-label={`Delete step ${row.stepNumber}`}
                                      onClick={() => setDelItemRow(row)}
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
                {itemRefetching ? <Box sx={adminTableRefetchOverlaySx} aria-hidden /> : null}
              </Box>

              <TablePagination
                component="div"
                count={itemTotal}
                page={itemPage}
                onPageChange={(_e, p) => setItemPage(p)}
                rowsPerPage={itemRowsPerPage}
                onRowsPerPageChange={(e) => {
                  setItemRowsPerPage(parseInt(e.target.value, 10));
                  setItemPage(0);
                }}
                rowsPerPageOptions={[5, 10, 25]}
              />
            </>
          )}
        </Paper>
      ) : (
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2, sm: 3 },
            borderRadius: 2,
            ...adminOutlinedTableContainerSx,
          }}
        >
          <Typography variant="body2" sx={adminMutedTextSx}>
            Select a process above to view or manage its steps.
          </Typography>
        </Paper>
      )}

      <Dialog
        open={openCreateProcess}
        onClose={() => !createProcessBusy && setOpenCreateProcess(false)}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Add process</DialogTitle>
        <DialogContent>
          <Box component="form" noValidate sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField
              label="Process name"
              value={createProcessForm.name}
              onChange={(e) => setCreateProcessForm((f) => ({ ...f, name: e.target.value }))}
              error={Boolean(createProcessErrors.name)}
              helperText={createProcessErrors.name || ""}
              fullWidth
              sx={themedTextFieldSx}
            />
            <TextField
              select
              label="Engine event (optional)"
              value={createProcessForm.engineEvent}
              onChange={(e) =>
                setCreateProcessForm((f) => ({ ...f, engineEvent: e.target.value }))
              }
              error={Boolean(createProcessErrors.engineEvent)}
              helperText={
                createProcessErrors.engineEvent ||
                "Binds this process to a submit action. Code and trigger are filled automatically. Leave unbound for educational processes not yet wired in the app."
              }
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
            {createProcessForm.engineEvent ? (
              <Typography variant="body2" sx={adminMutedTextSx}>
                Auto: code{" "}
                <strong>
                  {engineBindings.find((b) => b.triggerKey === createProcessForm.engineEvent)
                    ?.code || "—"}
                </strong>
                , trigger <strong>{createProcessForm.engineEvent}</strong>. Renaming later will not
                change this binding.
              </Typography>
            ) : null}
            <TextField
              label="Description (optional)"
              value={createProcessForm.description}
              onChange={(e) =>
                setCreateProcessForm((f) => ({ ...f, description: e.target.value }))
              }
              error={Boolean(createProcessErrors.description)}
              helperText={createProcessErrors.description || ""}
              fullWidth
              multiline
              minRows={2}
              sx={themedTextFieldSx}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenCreateProcess(false)} disabled={createProcessBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void createProcess()}
            disabled={createProcessBusy}
            startIcon={createProcessBusy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {createProcessBusy ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(editProcessRow)}
        onClose={() => !editProcessBusy && setEditProcessRow(null)}
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
              helperText={editProcessErrors.name || "Display label only — does not change the engine binding."}
              fullWidth
              sx={themedTextFieldSx}
            />
            <TextField
              select
              label="Engine event (optional)"
              value={editProcessForm.engineEvent}
              onChange={(e) => setEditProcessForm((f) => ({ ...f, engineEvent: e.target.value }))}
              error={Boolean(editProcessErrors.engineEvent)}
              helperText={
                editProcessErrors.engineEvent ||
                "Change or clear the submit trigger this process handles. Only one process may use each event."
              }
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
          <Button onClick={() => setEditProcessRow(null)} disabled={editProcessBusy}>
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
        open={openCreateItem}
        onClose={() => !createItemBusy && setOpenCreateItem(false)}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Add process step</DialogTitle>
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
          <Button onClick={() => setOpenCreateItem(false)} disabled={createItemBusy}>
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
        open={Boolean(editItemRow)}
        onClose={() => !editItemBusy && setEditItemRow(null)}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Edit process step</DialogTitle>
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
          <Button onClick={() => setEditItemRow(null)} disabled={editItemBusy}>
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
        open={Boolean(delItemRow)}
        onClose={() => !deleteItemBusy && setDelItemRow(null)}
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Delete process step?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete step <strong>{delItemRow?.stepNumber}</strong> ({delItemRow?.taskDescription})?
            This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDelItemRow(null)} disabled={deleteItemBusy}>
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
