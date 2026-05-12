"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
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
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
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

export function AdminProgrammesPanel() {
  const { showToast } = useToast();
  const [rows, setRows] = useState(/** @type {any[]} */ ([]));
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [patchingId, setPatchingId] = useState(/** @type {string | null} */ (null));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [defaultYearOfStudy, setDefaultYearOfStudy] = useState("3");
  const [createErrors, setCreateErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [editRow, setEditRow] = useState(/** @type {any} */ (null));
  const [editName, setEditName] = useState("");
  const [editShortName, setEditShortName] = useState("");
  const [editDefaultYear, setEditDefaultYear] = useState("3");
  const [editErrors, setEditErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [delRow, setDelRow] = useState(/** @type {any} */ (null));

  const load = useCallback(
    async (opts = /** @type {{ silent?: boolean }} */ ({})) => {
      const silent = Boolean(opts.silent);
      if (silent) setRefetching(true);
      else setLoading(true);
      try {
        const res = await fetch("/api/programmes", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast({
            message: typeof data.error === "string" ? data.error : "Could not load programmes.",
            severity: "error",
          });
          return;
        }
        setRows(Array.isArray(data.programmes) ? data.programmes : []);
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

  async function toggleActive(row) {
    setPatchingId(row.id);
    try {
      const res = await fetch(`/api/programmes/${row.id}`, {
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

  async function createProgramme() {
    /** @type {Record<string, string>} */
    const next = {};
    if (!String(name).trim()) next.name = "Name is required.";
    if (!String(shortName).trim()) next.shortName = "Short name is required.";
    setCreateErrors(next);
    if (Object.keys(next).length > 0) {
      showToast({
        message: "Please fix the highlighted fields.",
        severity: "error",
        duration: 6000,
      });
      return;
    }

    setCreateBusy(true);
    try {
      const res = await fetch("/api/programmes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          shortName,
          defaultYearOfStudy: Number(defaultYearOfStudy),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not create.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Programme created.", severity: "success" });
      setOpen(false);
      setCreateErrors({});
      setName("");
      setShortName("");
      setDefaultYearOfStudy("3");
      await load({ silent: true });
    } finally {
      setCreateBusy(false);
    }
  }

  function openEdit(row) {
    setEditRow(row);
    setEditName(row.name || "");
    setEditShortName(row.shortName || "");
    setEditDefaultYear(String(row.defaultYearOfStudy ?? 3));
    setEditErrors({});
  }

  async function saveEdit() {
    if (!editRow) return;
    /** @type {Record<string, string>} */
    const next = {};
    if (!String(editName).trim()) next.name = "Name is required.";
    if (!String(editShortName).trim()) next.shortName = "Short name is required.";
    setEditErrors(next);
    if (Object.keys(next).length > 0) {
      showToast({
        message: "Please fix the highlighted fields.",
        severity: "error",
        duration: 6000,
      });
      return;
    }

    setEditBusy(true);
    try {
      const res = await fetch(`/api/programmes/${editRow.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          shortName: editShortName.trim(),
          defaultYearOfStudy: Number(editDefaultYear),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save changes.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Programme updated.", severity: "success" });
      setEditRow(null);
      setEditErrors({});
      await load({ silent: true });
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteProgramme() {
    if (!delRow) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/programmes/${delRow.id}`, {
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
      showToast({ message: "Programme deleted.", severity: "success" });
      setDelRow(null);
      await load({ silent: true });
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy="true" aria-label="Loading programmes">
        <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <>
      <Button
        variant="contained"
        disabled={refetching}
        onClick={() => {
          setCreateErrors({});
          setName("");
          setShortName("");
          setDefaultYearOfStudy("3");
          setOpen(true);
        }}
        sx={{ mb: 2 }}
        className="w-full sm:w-auto"
      >
        Add programme
      </Button>
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
                <TableCell>Short</TableCell>
                <TableCell>Default year</TableCell>
                <TableCell>Active</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" sx={adminMutedTextSx}>
                      No programmes yet. Add one with the button above — only active programmes appear when staff
                      register students.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.shortName}</TableCell>
                    <TableCell>{row.defaultYearOfStudy ?? 3}</TableCell>
                    <TableCell>
                      <Switch
                        checked={row.isActive}
                        onChange={() => void toggleActive(row)}
                        disabled={patchingId === row.id || refetching}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: "inline-flex", gap: 0.25, justifyContent: "flex-end" }}>
                        <Tooltip title="Edit programme">
                          <IconButton
                            size="small"
                            aria-label="Edit programme"
                            disabled={refetching}
                            onClick={() => openEdit(row)}
                          >
                            <EditRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete programme">
                          <IconButton
                            size="small"
                            color="error"
                            aria-label="Delete programme"
                            disabled={refetching}
                            onClick={() => setDelRow(row)}
                          >
                            <DeleteOutlineRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {refetching ? (
          <Box
            sx={adminTableRefetchOverlaySx}
            aria-busy="true"
            aria-label="Updating programmes"
          >
            <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
          </Box>
        ) : null}
      </Box>

      <Dialog
        open={Boolean(delRow)}
        onClose={() => !deleteBusy && setDelRow(null)}
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Delete programme {delRow?.name}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            You can only delete programmes that have no student records. Otherwise deactivate with the
            toggle.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelRow(null)} disabled={deleteBusy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void deleteProgramme()}
            disabled={deleteBusy}
          >
            {deleteBusy ? <CircularProgress size={22} color="inherit" aria-hidden /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(editRow)}
        onClose={() => {
          if (editBusy) return;
          setEditRow(null);
          setEditErrors({});
        }}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Edit programme</DialogTitle>
        <DialogContent className="pt-2">
          <Box
            component="form"
            noValidate
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
          >
            <TextField
              label="Name"
              value={editName}
              onChange={(e) => {
                setEditName(e.target.value);
                setEditErrors((p) => {
                  const { name: _n, ...r } = p;
                  return r;
                });
              }}
              error={Boolean(editErrors.name)}
              helperText={editErrors.name}
              fullWidth
              sx={themedTextFieldSx}
            />
            <TextField
              label="Short name"
              value={editShortName}
              onChange={(e) => {
                setEditShortName(e.target.value);
                setEditErrors((p) => {
                  const { shortName: _s, ...r } = p;
                  return r;
                });
              }}
              error={Boolean(editErrors.shortName)}
              helperText={editErrors.shortName}
              fullWidth
              sx={themedTextFieldSx}
            />
            <FormControl
              fullWidth
              sx={{
                ...themedTextFieldSx,
                "& .MuiInputLabel-root": themedTextFieldSx["& .MuiInputLabel-root"],
              }}
            >
              <InputLabel id="prog-edit-default-year">Default year of study</InputLabel>
              <Select
                labelId="prog-edit-default-year"
                label="Default year of study"
                value={editDefaultYear}
                onChange={(e) => setEditDefaultYear(String(e.target.value))}
              >
                <MenuItem value="1">Year 1</MenuItem>
                <MenuItem value="2">Year 2</MenuItem>
                <MenuItem value="3">Year 3</MenuItem>
              </Select>
            </FormControl>
            <Typography
              variant="caption"
              sx={{ color: "color-mix(in oklab, var(--foreground) 60%, transparent)" }}
            >
              Active/inactive is controlled by the toggle in the table.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
          <Button
            type="button"
            onClick={() => {
              if (editBusy) return;
              setEditRow(null);
              setEditErrors({});
            }}
            disabled={editBusy}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="contained"
            disabled={editBusy}
            className="w-full sm:w-auto"
            onClick={() => void saveEdit()}
          >
            {editBusy ? <CircularProgress size={22} color="inherit" aria-hidden /> : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={open}
        onClose={() => {
          if (createBusy) return;
          setOpen(false);
          setCreateErrors({});
        }}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>New programme</DialogTitle>
        <DialogContent className="pt-2">
          {/*
            Native <form> must wrap fields (not DialogContent as component="form") so `id` + submit
            from DialogActions work reliably across MUI versions.
          */}
          <Box
            component="form"
            noValidate
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void createProgramme();
            }}
          >
            <TextField
              label="Name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setCreateErrors((p) => {
                  const { name: _n, ...r } = p;
                  return r;
                });
              }}
              error={Boolean(createErrors.name)}
              helperText={createErrors.name}
              fullWidth
              sx={themedTextFieldSx}
            />
            <TextField
              label="Short name"
              value={shortName}
              onChange={(e) => {
                setShortName(e.target.value);
                setCreateErrors((p) => {
                  const { shortName: _s, ...r } = p;
                  return r;
                });
              }}
              error={Boolean(createErrors.shortName)}
              helperText={createErrors.shortName}
              fullWidth
              sx={themedTextFieldSx}
            />
            <FormControl
              fullWidth
              sx={{
                ...themedTextFieldSx,
                "& .MuiInputLabel-root": themedTextFieldSx["& .MuiInputLabel-root"],
              }}
            >
              <InputLabel id="prog-default-year">Default year of study</InputLabel>
              <Select
                labelId="prog-default-year"
                label="Default year of study"
                value={defaultYearOfStudy}
                onChange={(e) => setDefaultYearOfStudy(String(e.target.value))}
              >
                <MenuItem value="1">Year 1</MenuItem>
                <MenuItem value="2">Year 2</MenuItem>
                <MenuItem value="3">Year 3</MenuItem>
              </Select>
            </FormControl>
            <Typography
              variant="caption"
              sx={{ color: "color-mix(in oklab, var(--foreground) 60%, transparent)" }}
            >
              Used as the default year when registering a student in this programme.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
          <Button
            type="button"
            onClick={() => {
              if (createBusy) return;
              setCreateErrors({});
              setOpen(false);
            }}
            disabled={createBusy}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="contained"
            disabled={createBusy}
            className="w-full sm:w-auto"
            onClick={() => void createProgramme()}
          >
            {createBusy ? <CircularProgress size={22} color="inherit" aria-hidden /> : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
