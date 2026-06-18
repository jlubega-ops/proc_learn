"use client";

import { useCallback, useEffect, useState, useDeferredValue } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import EditRounded from "@mui/icons-material/EditRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import PersonAddAlt1Rounded from "@mui/icons-material/PersonAddAlt1Rounded";
import UploadFileRounded from "@mui/icons-material/UploadFileRounded";
import ForwardToInboxRounded from "@mui/icons-material/ForwardToInboxRounded";
import BlockRounded from "@mui/icons-material/BlockRounded";
import LockOpenRounded from "@mui/icons-material/LockOpenRounded";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import { studentNumberFromStudentEmail } from "@/lib/mubs-email";
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
import { validateStudentAccountForm } from "@/lib/validation/student-form";
import { BRAND_BTN_PRIMARY_CLASS } from "@/lib/brand-ui";
import { AdminStudentsBulkImportDialog } from "@/components/admin/admin-students-bulk-import-dialog";
import { useToast } from "@/components/providers/toast-provider";

/**
 * @typedef {{
 *   id: string;
 *   email: string;
 *   displayName: string;
 *   firstName: string;
 *   lastName: string;
 *   middleName: string | null;
 *   studentNumber: string | null;
 *   registrationNumber: string | null;
 *   programmeId: string | null;
 *   programmeName: string | null;
 *   programmeShortName: string | null;
 *   academicYearLabel: string | null;
 *   yearOfStudy: number | null;
 *   sex: string | null;
 *   accountStatus: string;
 *   suspendedReason: string | null;
 *   activatedAt: string | null;
 *   lastLoginAt: string | null;
 *   canResendActivation: boolean;
 * }} StudentRow
 */

function formatWhen(iso) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

function studentStatusLabel(row) {
  if (row.accountStatus === "SUSPENDED") return "Suspended";
  if (row.accountStatus === "PENDING_ACTIVATION") return "Pending activation";
  return "Active";
}

export function AdminStudentsPanel() {
  const { showToast } = useToast();
  const [rows, setRows] = useState(/** @type {StudentRow[]} */ ([]));
  const [programmes, setProgrammes] = useState(
    /** @type {{ id: string; name: string; defaultYearOfStudy?: number }[]} */ ([]),
  );
  const [academicYears, setAcademicYears] = useState(/** @type {string[]} */ ([]));
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [q, setQ] = useState("");
  const [programmeId, setProgrammeId] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [editRow, setEditRow] = useState(/** @type {StudentRow | null} */ (null));
  const [delRow, setDelRow] = useState(/** @type {StudentRow | null} */ (null));
  const [reasonOpen, setReasonOpen] = useState(
    /** @type {{ title: string; text: string } | null} */ (null),
  );
  const [suspendTarget, setSuspendTarget] = useState(/** @type {StudentRow | null} */ (null));
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendBusy, setSuspendBusy] = useState(false);
  const [unsuspendTarget, setUnsuspendTarget] = useState(/** @type {StudentRow | null} */ (null));
  const [unsuspendBusy, setUnsuspendBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [resendingId, setResendingId] = useState(/** @type {string | null} */ (null));

  const [email, setEmail] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [progId, setProgId] = useState("");
  const [yearOfStudy, setYearOfStudy] = useState("3");
  const [acadLabel, setAcadLabel] = useState("");
  const [sex, setSex] = useState("");
  const [snSynced, setSnSynced] = useState(true);
  /** @type {[Record<string, string>, import("react").Dispatch<import("react").SetStateAction<Record<string, string>>>]} */
  const [fieldErrors, setFieldErrors] = useState({});

  const deferredSearch = useDeferredValue(q.trim());

  const loadMeta = useCallback(async () => {
    const [pRes, yRes] = await Promise.all([
      fetch("/api/programmes", { credentials: "include" }),
      fetch("/api/meta/academic-years"),
    ]);
    const pData = await pRes.json().catch(() => ({}));
    const yData = await yRes.json().catch(() => ({}));
    if (pRes.ok && Array.isArray(pData.programmes)) setProgrammes(pData.programmes);
    if (yRes.ok && Array.isArray(yData.extended)) {
      setAcademicYears(yData.extended);
      setAcadLabel((prev) => prev || (Array.isArray(yData.primary) ? yData.primary[0] : "") || "");
    }
  }, []);

  const loadStudents = useCallback(
    async (opts = /** @type {{ silent?: boolean }} */ ({})) => {
      const silent = Boolean(opts.silent);
      if (silent) setRefetching(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams();
        if (deferredSearch) params.set("q", deferredSearch);
        if (programmeId) params.set("programmeId", programmeId);
        if (academicYear) params.set("academicYear", academicYear);
        const res = await fetch(`/api/admin/students?${params.toString()}`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast({
            message: typeof data.error === "string" ? data.error : "Could not load students.",
            severity: "error",
          });
          setRows([]);
          return;
        }
        setRows(Array.isArray(data.students) ? data.students : []);
      } finally {
        if (silent) setRefetching(false);
        else setLoading(false);
      }
    },
    [deferredSearch, programmeId, academicYear, showToast],
  );

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  function openEdit(row) {
    setFieldErrors({});
    setEditRow(row);
    setEmail(row.email);
    const sn = row.studentNumber || "";
    setStudentNumber(sn);
    const from = studentNumberFromStudentEmail(row.email) || "";
    setSnSynced(sn === from);
    setFirstName(row.firstName || "");
    setLastName(row.lastName || "");
    setMiddleName(row.middleName || "");
    setSex(row.sex && (row.sex === "MALE" || row.sex === "FEMALE") ? row.sex : "");
    setRegistrationNumber(row.registrationNumber || "");
    setProgId(row.programmeId || "");
    setYearOfStudy(String(row.yearOfStudy ?? 3));
    setAcadLabel(row.academicYearLabel || "");
  }

  async function saveEdit() {
    if (!editRow) return;
    const next = validateStudentAccountForm({
      email,
      studentNumber,
      firstName,
      lastName,
      middleName,
      registrationNumber,
      programmeId: progId,
      academicYearLabel: acadLabel,
      sex,
    });
    setFieldErrors(next);
    if (Object.keys(next).length > 0) {
      showToast({
        message: "Please fix the highlighted fields.",
        severity: "error",
        duration: 6000,
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/students/${editRow.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          studentNumber: studentNumber.replace(/\D/g, ""),
          firstName,
          lastName,
          middleName: middleName.trim() || null,
          sex: sex || null,
          registrationNumber,
          programmeId: progId,
          yearOfStudy: Number(yearOfStudy),
          academicYearLabel: acadLabel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : "Could not save.";
        showToast({
          message: msg.charAt(0).toUpperCase() + msg.slice(1).toLowerCase(),
          severity: "error",
          duration: 8000,
        });
        return;
      }
      showToast({ message: "Student updated.", severity: "success" });
      setEditRow(null);
      setFieldErrors({});
      await loadStudents({ silent: true });
    } finally {
      setSaving(false);
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
      showToast({ message: "Student account suspended.", severity: "success" });
      setSuspendTarget(null);
      setSuspendReason("");
      await loadStudents({ silent: true });
    } finally {
      setSuspendBusy(false);
    }
  }

  async function confirmUnsuspendStudent() {
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
      showToast({ message: "Student account reactivated.", severity: "success" });
      setUnsuspendTarget(null);
      await loadStudents({ silent: true });
    } finally {
      setUnsuspendBusy(false);
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
      showToast({ message: "Activation email sent.", severity: "success" });
    } finally {
      setResendingId(null);
    }
  }

  async function confirmDelete() {
    if (!delRow) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/students/${delRow.id}`, {
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
      showToast({ message: "Student removed.", severity: "success" });
      setDelRow(null);
      await loadStudents({ silent: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-col flex-wrap gap-3 rounded-xl border border-zinc-200 bg-background p-3 dark:border-zinc-800 sm:flex-row sm:items-end">
        <TextField
          size="small"
          label="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Email, name, student number…"
          sx={{ ...themedTextFieldSx, minWidth: 220 }}
        />
        <TextField
          select
          size="small"
          label="Programme"
          value={programmeId}
          onChange={(e) => setProgrammeId(e.target.value)}
          sx={{ ...themedTextFieldSx, minWidth: 200 }}
        >
          <MenuItem value="">All programmes</MenuItem>
          {programmes.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Academic year"
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          sx={{ ...themedTextFieldSx, minWidth: 160 }}
        >
          <MenuItem value="">All years</MenuItem>
          {academicYears.map((y) => (
            <MenuItem key={y} value={y}>
              {y}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="outlined" onClick={() => void loadStudents({ silent: true })}>
          Refresh
        </Button>
        <Button
          type="button"
          variant="outlined"
          startIcon={<UploadFileRounded />}
          onClick={() => setBulkOpen(true)}
          className="w-full sm:w-auto"
        >
          Import from Excel
        </Button>
        <Link
          href="/students/new"
          className={`${BRAND_BTN_PRIMARY_CLASS} h-9 min-h-9 w-full gap-1.5 sm:w-auto sm:px-4`}
        >
          <PersonAddAlt1Rounded sx={{ fontSize: 20 }} aria-hidden />
          <span>Add student</span>
        </Link>
      </div>

      {loading ? (
        <Box sx={adminCenteredLoadingBoxSx} aria-busy="true" aria-label="Loading students">
          <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
        </Box>
      ) : (
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
                <TableCell>Student #</TableCell>
                <TableCell>Programme</TableCell>
                <TableCell>Year</TableCell>
                <TableCell>Academic year</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last login</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.displayName}</TableCell>
                  <TableCell>{row.email}</TableCell>
                  <TableCell>{row.studentNumber}</TableCell>
                  <TableCell>
                    {row.programmeShortName || row.programmeName ? (
                      <Tooltip
                        title={row.programmeName || row.programmeShortName || ""}
                        disableHoverListener={
                          !row.programmeName ||
                          row.programmeName === row.programmeShortName
                        }
                      >
                        <span>{row.programmeShortName || row.programmeName}</span>
                      </Tooltip>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{row.yearOfStudy}</TableCell>
                  <TableCell>{row.academicYearLabel}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1">
                      {studentStatusLabel(row)}
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
                  <TableCell>{formatWhen(row.lastLoginAt)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    <Box sx={{ display: "inline-flex", gap: 0.25, justifyContent: "flex-end" }}>
                      <Tooltip title="Edit student">
                        <IconButton
                          size="small"
                          aria-label="Edit student"
                          disabled={refetching}
                          onClick={() => openEdit(row)}
                        >
                          <EditRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {row.canResendActivation ? (
                        <Tooltip title="Resend activation email">
                          <span>
                            <IconButton
                              size="small"
                              aria-label="Resend activation email"
                              disabled={refetching || resendingId === row.id}
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
                      <Tooltip title="Delete student">
                        <IconButton
                          size="small"
                          color="error"
                          aria-label="Delete student"
                          disabled={refetching}
                          onClick={() => setDelRow(row)}
                        >
                          <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {row.accountStatus === "SUSPENDED" ? (
                        <Tooltip title="Unsuspend student">
                          <IconButton
                            size="small"
                            color="success"
                            aria-label="Unsuspend student"
                            disabled={refetching}
                            onClick={() => setUnsuspendTarget(row)}
                          >
                            <LockOpenRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title="Suspend student">
                          <IconButton
                            size="small"
                            color="warning"
                            aria-label="Suspend student"
                            disabled={refetching}
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
              aria-label="Updating students"
            >
              <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
            </Box>
          ) : null}
        </Box>
      )}

      <Dialog
        open={Boolean(editRow)}
        onClose={() => {
          if (!saving) {
            setEditRow(null);
            setFieldErrors({});
          }
        }}
        fullWidth
        maxWidth="md"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Edit student</DialogTitle>
        <DialogContent className="flex flex-col gap-3 pt-2">
          <Typography variant="caption" sx={{ color: "color-mix(in oklab, var(--foreground) 65%, transparent)" }}>
            Email must be digits@mubs.ac.ug. Student number fills from email while in sync; change the number if it
            should differ.
          </Typography>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="School email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => {
                const v = e.target.value.trim().toLowerCase();
                setEmail(v);
                const from = studentNumberFromStudentEmail(v) || "";
                if (snSynced) setStudentNumber(from);
                setFieldErrors((p) => {
                  const { email: _e, ...r } = p;
                  return r;
                });
              }}
              error={Boolean(fieldErrors.email)}
              helperText={fieldErrors.email}
              fullWidth
              sx={themedTextFieldSx}
            />
            <TextField
              label="Student number"
              autoComplete="off"
              value={studentNumber}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setStudentNumber(digits);
                const from = studentNumberFromStudentEmail(email) || "";
                setSnSynced(digits === from);
                setFieldErrors((p) => {
                  const { studentNumber: _s, ...r } = p;
                  return r;
                });
              }}
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
              error={Boolean(fieldErrors.studentNumber)}
              helperText={fieldErrors.studentNumber}
              fullWidth
              sx={themedTextFieldSx}
            />
          </div>
          <Divider sx={{ borderColor: "color-mix(in oklab, var(--foreground) 12%, transparent)" }} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="First name"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                setFieldErrors((p) => {
                  const { firstName: _f, ...r } = p;
                  return r;
                });
              }}
              error={Boolean(fieldErrors.firstName)}
              helperText={fieldErrors.firstName}
              fullWidth
              sx={themedTextFieldSx}
            />
            <TextField
              label="Last name"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                setFieldErrors((p) => {
                  const { lastName: _l, ...r } = p;
                  return r;
                });
              }}
              error={Boolean(fieldErrors.lastName)}
              helperText={fieldErrors.lastName}
              fullWidth
              sx={themedTextFieldSx}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="Middle name"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              fullWidth
              sx={themedTextFieldSx}
            />
            <TextField
              select
              label="Sex (optional)"
              value={sex}
              onChange={(e) => {
                setSex(e.target.value);
                setFieldErrors((p) => {
                  const { sex: _x, ...r } = p;
                  return r;
                });
              }}
              error={Boolean(fieldErrors.sex)}
              helperText={fieldErrors.sex}
              fullWidth
              sx={themedTextFieldSx}
            >
              <MenuItem value="">—</MenuItem>
              <MenuItem value="MALE">Male</MenuItem>
              <MenuItem value="FEMALE">Female</MenuItem>
            </TextField>
          </div>
          <TextField
            label="Registration number"
            value={registrationNumber}
            onChange={(e) => {
              setRegistrationNumber(e.target.value);
              setFieldErrors((p) => {
                const { registrationNumber: _r, ...r } = p;
                return r;
              });
            }}
            error={Boolean(fieldErrors.registrationNumber)}
            helperText={fieldErrors.registrationNumber}
            fullWidth
            sx={themedTextFieldSx}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TextField
              select
              label="Programme"
              value={progId}
              onChange={(e) => {
                const id = e.target.value;
                setProgId(id);
                const p = programmes.find((x) => x.id === id);
                if (
                  p &&
                  typeof p.defaultYearOfStudy === "number" &&
                  [1, 2, 3].includes(p.defaultYearOfStudy)
                ) {
                  setYearOfStudy(String(p.defaultYearOfStudy));
                }
                setFieldErrors((p) => {
                  const { programmeId: _p, ...r } = p;
                  return r;
                });
              }}
              error={Boolean(fieldErrors.programmeId)}
              helperText={fieldErrors.programmeId}
              fullWidth
              sx={themedTextFieldSx}
            >
              {programmes.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Year of study"
              value={yearOfStudy}
              onChange={(e) => setYearOfStudy(e.target.value)}
              fullWidth
              sx={themedTextFieldSx}
            >
              <MenuItem value="1">1</MenuItem>
              <MenuItem value="2">2</MenuItem>
              <MenuItem value="3">3</MenuItem>
            </TextField>
            <TextField
              select
              label="Academic year"
              value={acadLabel}
              onChange={(e) => {
                setAcadLabel(e.target.value);
                setFieldErrors((p) => {
                  const { academicYearLabel: _a, ...r } = p;
                  return r;
                });
              }}
              error={Boolean(fieldErrors.academicYearLabel)}
              helperText={fieldErrors.academicYearLabel}
              fullWidth
              sx={themedTextFieldSx}
            >
              {academicYears.map((y) => (
                <MenuItem key={y} value={y}>
                  {y}
                </MenuItem>
              ))}
            </TextField>
          </div>
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
        <DialogTitle>Delete student {delRow?.email}?</DialogTitle>
        <DialogContent>
          <Typography>This permanently removes the student account and profile.</Typography>
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
        open={Boolean(suspendTarget)}
        onClose={() => !suspendBusy && setSuspendTarget(null)}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Suspend student {suspendTarget?.email}</DialogTitle>
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
            onClick={() => void confirmUnsuspendStudent()}
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

      <AdminStudentsBulkImportDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onImported={() => void loadStudents({ silent: true })}
      />
    </>
  );
}
