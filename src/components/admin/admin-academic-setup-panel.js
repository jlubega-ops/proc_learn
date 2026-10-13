"use client";

import { useCallback, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddRounded from "@mui/icons-material/AddRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";
import { useDraftSync } from "@/hooks/use-draft-sync";
import { useApi } from "@/hooks/use-api";
import { revalidateApi } from "@/lib/api-client-cache";
import { BRAND_BTN_PRIMARY_CLASS } from "@/lib/brand-ui";

/**
 * System Admin Academic setup: academic years and courses only.
 */
export function AdminAcademicSetupPanel() {
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);

  const [yearDialog, setYearDialog] = useState(false);
  const [courseDialog, setCourseDialog] = useState(false);
  const [editing, setEditing] = useState(/** @type {any} */ (null));
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}));

  const [yearForm, setYearForm] = useState({
    label: "",
    startDate: "",
    endDate: "",
    description: "",
    isCurrent: false,
  });
  const [courseForm, setCourseForm] = useState({
    code: "",
    name: "",
    programmeId: "",
    description: "",
    isActive: true,
  });

  const editingKey = editing?.id ? String(editing.id) : "new";

  const yearDraft = useDraftSync(
    `admin:academic-year:${editingKey}`,
    yearForm,
    (d) =>
      setYearForm((f) => ({
        label: typeof d.label === "string" ? d.label : f.label,
        startDate: typeof d.startDate === "string" ? d.startDate : f.startDate,
        endDate: typeof d.endDate === "string" ? d.endDate : f.endDate,
        description: typeof d.description === "string" ? d.description : f.description,
        isCurrent: typeof d.isCurrent === "boolean" ? d.isCurrent : f.isCurrent,
      })),
    { enabled: yearDialog, resetKey: editingKey },
  );

  const courseDraft = useDraftSync(
    `admin:course:${editingKey}`,
    courseForm,
    (d) =>
      setCourseForm((f) => ({
        code: typeof d.code === "string" ? d.code : f.code,
        name: typeof d.name === "string" ? d.name : f.name,
        programmeId: typeof d.programmeId === "string" ? d.programmeId : f.programmeId,
        description: typeof d.description === "string" ? d.description : f.description,
        isActive: typeof d.isActive === "boolean" ? d.isActive : f.isActive,
      })),
    { enabled: courseDialog, resetKey: editingKey },
  );

  function closeYearDialog() {
    if (busy) return;
    yearDraft.clearDraft();
    setYearDialog(false);
  }

  function closeCourseDialog() {
    if (busy) return;
    courseDraft.clearDraft();
    setCourseDialog(false);
  }

  const yearsQuery = useApi("/api/admin/academic-years", {
    errorMessage: "Could not load academic years.",
  });
  const coursesQuery = useApi("/api/admin/courses", { silentErrors: true });
  const programmesQuery = useApi("/api/programmes", { silentErrors: true });
  const contextQuery = useApi("/api/meta/academic-context", { silentErrors: true });
  const years = Array.isArray(yearsQuery.data?.academicYears) ? yearsQuery.data.academicYears : [];
  const courses = Array.isArray(coursesQuery.data?.courses) ? coursesQuery.data.courses : [];
  const programmes = Array.isArray(programmesQuery.data?.programmes)
    ? programmesQuery.data.programmes
    : [];
  const context = contextQuery.error ? null : contextQuery.data || null;
  const loading =
    yearsQuery.loading || coursesQuery.loading || programmesQuery.loading || contextQuery.loading;
  const refreshing =
    yearsQuery.refreshing ||
    coursesQuery.refreshing ||
    programmesQuery.refreshing ||
    contextQuery.refreshing;
  const reloadYears = yearsQuery.reload;
  const reloadCourses = coursesQuery.reload;
  const reloadProgrammes = programmesQuery.reload;
  const reloadContext = contextQuery.reload;

  const load = useCallback(async () => {
    await Promise.all([reloadYears(), reloadCourses(), reloadProgrammes(), reloadContext()]);
    void revalidateApi("/api/meta/academic-years", "/api/programme-processes");
  }, [reloadYears, reloadCourses, reloadProgrammes, reloadContext]);

  async function submitYear(e) {
    e.preventDefault();
    setBusy(true);
    setFieldErrors({});
    try {
      const url = editing
        ? `/api/admin/academic-years/${editing.id}`
        : "/api/admin/academic-years";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(yearForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save academic year.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Academic year saved.", severity: "success" });
      yearDraft.clearDraft();
      setYearDialog(false);
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function setCurrentYear(id) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/academic-years/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setCurrent: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not set current year.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Current academic year updated.", severity: "success" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function submitCourse(e) {
    e.preventDefault();
    setBusy(true);
    setFieldErrors({});
    try {
      const url = editing ? `/api/admin/courses/${editing.id}` : "/api/admin/courses";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...courseForm,
          programmeId: courseForm.programmeId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save course.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Course saved.", severity: "success" });
      courseDraft.clearDraft();
      setCourseDialog(false);
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
        <CircularProgress size={28} sx={adminLoadingSpinnerSx} />
        <Typography variant="body2" sx={adminMutedTextSx}>
          Loading academic setup…
        </Typography>
      </Box>
    );
  }

  return (
    <div className="space-y-4">
      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          Current academic context
        </Typography>
        {context?.academicYear ? (
          <Typography variant="body2">
            Academic year <strong>{context.academicYear.label}</strong>
          </Typography>
        ) : (
          <Typography variant="body2" sx={adminMutedTextSx}>
            No current academic year yet. Create and mark one current.
          </Typography>
        )}
      </Paper>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          value={tab}
          onChange={(_e, v) => setTab(v)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab label="Academic years" />
          <Tab label="Courses" />
        </Tabs>
        <Button
          size="small"
          startIcon={<RefreshRounded />}
          onClick={() => void load()}
          disabled={busy || refreshing}
          className="cursor-pointer"
        >
          Refresh
        </Button>
      </div>

      {tab === 0 ? (
        <div className="space-y-3">
          <Button
            variant="contained"
            startIcon={<AddRounded />}
            className={`${BRAND_BTN_PRIMARY_CLASS} cursor-pointer`}
            onClick={() => {
              setEditing(null);
              setFieldErrors({});
              setYearForm({
                label: "",
                startDate: "",
                endDate: "",
                description: "",
                isCurrent: years.length === 0,
              });
              setYearDialog(true);
            }}
          >
            Add academic year
          </Button>
          {years.length === 0 ? (
            <Typography variant="body2" sx={adminMutedTextSx}>
              No academic years yet. Add one to define the current university year (separate from
              organisation financial years).
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
              <Table size="small" sx={adminTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>Label</TableCell>
                    <TableCell>Dates</TableCell>
                    <TableCell>Current</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {years.map((y) => (
                    <TableRow key={y.id}>
                      <TableCell>{y.label}</TableCell>
                      <TableCell>
                        {y.startDate} → {y.endDate}
                      </TableCell>
                      <TableCell>{y.isCurrent ? "Yes" : "—"}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        {!y.isCurrent ? (
                          <Tooltip title="Set as current academic year">
                            <IconButton
                              size="small"
                              color="primary"
                              aria-label="Set as current academic year"
                              disabled={busy}
                              onClick={() => void setCurrentYear(y.id)}
                            >
                              <CheckCircleRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        <Tooltip title="Edit academic year">
                          <IconButton
                            size="small"
                            color="primary"
                            aria-label="Edit academic year"
                            onClick={() => {
                              setEditing(y);
                              setFieldErrors({});
                              setYearForm({
                                label: y.label,
                                startDate: y.startDate,
                                endDate: y.endDate,
                                description: y.description || "",
                                isCurrent: y.isCurrent,
                              });
                              setYearDialog(true);
                            }}
                          >
                            <EditRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </div>
      ) : null}

      {tab === 1 ? (
        <div className="space-y-3">
          <Button
            variant="contained"
            startIcon={<AddRounded />}
            className={`${BRAND_BTN_PRIMARY_CLASS} cursor-pointer`}
            onClick={() => {
              setEditing(null);
              setFieldErrors({});
              setCourseForm({
                code: "",
                name: "",
                programmeId: "",
                description: "",
                isActive: true,
              });
              setCourseDialog(true);
            }}
          >
            Add course
          </Button>
          {courses.length === 0 ? (
            <Typography variant="body2" sx={adminMutedTextSx}>
              No courses yet. Courses are used later to assign academic projects and filter students.
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
              <Table size="small" sx={adminTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>Code</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Programme</TableCell>
                    <TableCell>Active</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {courses.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.code}</TableCell>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{c.programme?.shortName || "—"}</TableCell>
                      <TableCell>{c.isActive ? "Yes" : "No"}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edit course">
                          <IconButton
                            size="small"
                            color="primary"
                            aria-label="Edit course"
                            onClick={() => {
                              setEditing(c);
                              setFieldErrors({});
                              setCourseForm({
                                code: c.code,
                                name: c.name,
                                programmeId: c.programmeId || "",
                                description: c.description || "",
                                isActive: c.isActive,
                              });
                              setCourseDialog(true);
                            }}
                          >
                            <EditRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </div>
      ) : null}

      <Dialog
        open={yearDialog}
        onClose={closeYearDialog}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: adminDialogPaperSx }}
      >
        <form noValidate onSubmit={(e) => void submitYear(e)}>
          <DialogTitle>{editing ? "Edit academic year" : "Add academic year"}</DialogTitle>
          <DialogContent className="flex flex-col gap-3 pt-2">
            <TextField
              label="Label"
              value={yearForm.label}
              onChange={(e) => setYearForm((f) => ({ ...f, label: e.target.value }))}
              error={Boolean(fieldErrors.label)}
              helperText={fieldErrors.label || "Format: 2025/2026"}
              fullWidth
              sx={themedTextFieldSx}
              disabled={Boolean(editing)}
            />
            <TextField
              label="Start date"
              type="date"
              value={yearForm.startDate}
              onChange={(e) => setYearForm((f) => ({ ...f, startDate: e.target.value }))}
              error={Boolean(fieldErrors.startDate)}
              helperText={fieldErrors.startDate}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              sx={themedTextFieldSx}
            />
            <TextField
              label="End date"
              type="date"
              value={yearForm.endDate}
              onChange={(e) => setYearForm((f) => ({ ...f, endDate: e.target.value }))}
              error={Boolean(fieldErrors.endDate)}
              helperText={fieldErrors.endDate}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              sx={themedTextFieldSx}
            />
            <TextField
              label="Description"
              value={yearForm.description}
              onChange={(e) => setYearForm((f) => ({ ...f, description: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
              sx={themedTextFieldSx}
            />
            {!editing ? (
              <FormControlLabel
                control={
                  <Switch
                    checked={yearForm.isCurrent}
                    onChange={(e) => setYearForm((f) => ({ ...f, isCurrent: e.target.checked }))}
                  />
                }
                label="Set as current academic year"
              />
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeYearDialog} disabled={busy} className="cursor-pointer">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={busy} className="cursor-pointer">
              {busy ? <CircularProgress size={18} /> : "Save"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog
        open={courseDialog}
        onClose={closeCourseDialog}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: adminDialogPaperSx }}
      >
        <form noValidate onSubmit={(e) => void submitCourse(e)}>
          <DialogTitle>{editing ? "Edit course" : "Add course"}</DialogTitle>
          <DialogContent className="flex flex-col gap-3 pt-2">
            <TextField
              label="Code"
              value={courseForm.code}
              onChange={(e) => setCourseForm((f) => ({ ...f, code: e.target.value }))}
              error={Boolean(fieldErrors.code)}
              helperText={fieldErrors.code}
              fullWidth
              sx={themedTextFieldSx}
            />
            <TextField
              label="Name"
              value={courseForm.name}
              onChange={(e) => setCourseForm((f) => ({ ...f, name: e.target.value }))}
              error={Boolean(fieldErrors.name)}
              helperText={fieldErrors.name}
              fullWidth
              sx={themedTextFieldSx}
            />
            <TextField
              select
              label="Programme (optional)"
              value={courseForm.programmeId}
              onChange={(e) => setCourseForm((f) => ({ ...f, programmeId: e.target.value }))}
              error={Boolean(fieldErrors.programmeId)}
              helperText={fieldErrors.programmeId}
              fullWidth
              sx={themedTextFieldSx}
            >
              <MenuItem value="">None</MenuItem>
              {programmes.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.shortName} — {p.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Description"
              value={courseForm.description}
              onChange={(e) => setCourseForm((f) => ({ ...f, description: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
              sx={themedTextFieldSx}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={courseForm.isActive}
                  onChange={(e) => setCourseForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
              }
              label="Active"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={closeCourseDialog} disabled={busy} className="cursor-pointer">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={busy} className="cursor-pointer">
              {busy ? <CircularProgress size={18} /> : "Save"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </div>
  );
}
