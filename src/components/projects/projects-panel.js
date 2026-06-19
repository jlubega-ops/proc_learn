"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import EditRounded from "@mui/icons-material/EditRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import AddRounded from "@mui/icons-material/AddRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import HowToRegRounded from "@mui/icons-material/HowToRegRounded";
import GroupRounded from "@mui/icons-material/GroupRounded";
import UploadFileRounded from "@mui/icons-material/UploadFileRounded";
import LogoutRounded from "@mui/icons-material/LogoutRounded";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import AutorenewRounded from "@mui/icons-material/AutorenewRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { format, isValid, parseISO } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import { useAuthSession } from "@/components/providers/auth-session-provider";
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
  dateTimeInputConstraints,
  validateDateTimeRange,
} from "@/lib/validation/date-range";

const STUDENT_FILTERS = [
  { value: "all", label: "All" },
  { value: "private", label: "Private" },
  { value: "public", label: "Public" },
  { value: "assignments", label: "Assignments" },
  { value: "lecturer", label: "Lecturer projects" },
];

const STAFF_SCOPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "student", label: "Student" },
  { value: "lecturer", label: "Lecturer" },
];

const STAFF_PURPOSE_FILTERS = [
  { value: "all", label: "All" },
  { value: "practice", label: "Practice" },
  { value: "assignments", label: "Assignments" },
];

const LECTURER_PURPOSE_FILTERS = [
  { value: "all", label: "All" },
  { value: "practice", label: "Practice" },
];

const STAFF_STATUS_FILTERS = [
  { value: "all", label: "All status" },
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

const OPEN_STATUS_FILTERS = [
  { value: "all", label: "All open states" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "not_yet", label: "Not yet" },
];

const TinyEditor = dynamic(
  () => import("@tinymce/tinymce-react").then((m) => m.Editor),
  {
    ssr: false,
    loading: () => (
      <Box sx={adminCenteredLoadingBoxSx}>
        <CircularProgress size={24} sx={adminLoadingSpinnerSx} />
      </Box>
    ),
  },
);

function formatDuration(durationSeconds) {
  if (!durationSeconds || durationSeconds <= 0) return "—";
  const h = Math.floor(durationSeconds / 3600);
  const m = Math.floor((durationSeconds % 3600) / 60);
  const s = durationSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatCalendarDate(value) {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : new Date(value);
  if (!isValid(d)) return "—";
  return format(d, "MMM d, yyyy");
}

function statusChipColor(status) {
  if (status === "COMPLETED" || status === "SUBMITTED") return "success";
  if (status === "IN_PROGRESS") return "info";
  if (status === "NOT_STARTED") return "warning";
  return "default";
}

function openState(row) {
  const now = Date.now();
  const openAt = row?.openAt ? new Date(row.openAt).getTime() : null;
  const closeAt = row?.closeAt ? new Date(row.closeAt).getTime() : null;
  if (openAt && now < openAt) return "NOT_YET";
  if (closeAt && now > closeAt) return "CLOSED";
  return "OPEN";
}

function openStateLabel(state) {
  if (state === "NOT_YET") return "Not yet";
  if (state === "CLOSED") return "Closed";
  return "Open";
}

function openStateColor(state) {
  if (state === "NOT_YET") return "warning";
  if (state === "CLOSED") return "error";
  return "success";
}

function formatPurpose(value) {
  if (String(value || "").toUpperCase() === "ASSIGNMENT") return "Assignment";
  return "Practice";
}

function enrollmentStatusForRow(row) {
  const first = Array.isArray(row?.enrollments) ? row.enrollments[0] : null;
  return first?.status || "NOT_STARTED";
}

function defaultForm() {
  return {
    name: "",
    description: "",
    organizationName: "",
    purpose: "PRACTICE",
    visibility: "PRIVATE",
    openAt: "",
    closeAt: "",
    durationHours: "0",
    durationMinutes: "0",
    instructions: "",
    questionText: "",
    questionFileUrl: "",
    enrollmentAccessKey: "",
    isPublished: false,
  };
}

function generateEnrollmentAccessKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * @param {string} activeRole
 * @param {any} form
 */
function validateClientForm(activeRole, form) {
  /** @type {Record<string, string>} */
  const errors = {};
  if (!String(form.name || "").trim()) errors.name = "Project name is required.";
  if (activeRole === "STUDENT" && !String(form.organizationName || "").trim()) {
    errors.organizationName = "Organisation name is required.";
  }
  const dateRange = validateDateTimeRange(form.openAt, form.closeAt);
  Object.assign(errors, dateRange.errors);
  if (activeRole !== "STUDENT") {
    const hRaw = String(form.durationHours ?? "").trim();
    const mRaw = String(form.durationMinutes ?? "").trim();
    const h = hRaw ? Number(hRaw) : 0;
    const m = mRaw ? Number(mRaw) : 0;
    const hasDurationInput = (hRaw !== "" || mRaw !== "") && (h > 0 || m > 0);
    const hasPositiveDuration = Number.isFinite(h) && Number.isFinite(m) && h * 60 + m > 0;
    const requiresDuration = String(form.purpose || "").toUpperCase() === "ASSIGNMENT";

    if (hasDurationInput || requiresDuration) {
      if (!Number.isInteger(h) || h < 0) errors.durationHours = "Hours must be 0 or more.";
      if (!Number.isInteger(m) || m < 0 || m > 59) {
        errors.durationMinutes = "Minutes must be between 0 and 59.";
      }
      if (
        !errors.durationHours &&
        !errors.durationMinutes &&
        !hasPositiveDuration
      ) {
        errors.durationMinutes = requiresDuration
          ? "Duration is required for assignment projects."
          : "Set at least 1 minute.";
      }
    }
  }
  if (
    String(form.questionFileUrl || "").trim() &&
    !/^https?:\/\//i.test(form.questionFileUrl.trim()) &&
    !form.questionFileUrl.trim().startsWith("/api/media/")
  ) {
    errors.questionFileUrl = "File link must be http(s):// or /api/media/... URL.";
  }
  if (activeRole !== "STUDENT" && String(form.enrollmentAccessKey || "").trim()) {
    const key = String(form.enrollmentAccessKey).trim().toUpperCase();
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(key)) {
      errors.enrollmentAccessKey =
        "Use exactly 5 chars (A-Z, 2-9), excluding confusing characters like 0/1/I/O.";
    }
  }
  return errors;
}

export function ProjectsPanel() {
  const { showToast } = useToast();
  const { session, loading: sessionLoading, setSessionBlocking } = useAuthSession();
  const activeRole = session?.activeRole || "STUDENT";
  const isStudent = activeRole === "STUDENT";
  const isLecturer = activeRole === "LECTURER";
  const isExaminer = activeRole === "EXAMINER";
  const isSystemAdmin = activeRole === "SYSTEM_ADMIN";
  const isExaminerLike = isExaminer || isSystemAdmin;
  const isStaffViewer = isLecturer || isExaminerLike;
  const canCreate = isStudent || isLecturer || isExaminerLike;
  const filterOptions = STUDENT_FILTERS;
  const staffPurposeFilters = isLecturer ? LECTURER_PURPOSE_FILTERS : STAFF_PURPOSE_FILTERS;
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("all");
  const [staffScope, setStaffScope] = useState("all");
  const [staffPurpose, setStaffPurpose] = useState("all");
  const [staffStatus, setStaffStatus] = useState("all");
  const [openStatus, setOpenStatus] = useState("open");

  const [openEditor, setOpenEditor] = useState(false);
  const [busyEditor, setBusyEditor] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingManagedStudent, setEditingManagedStudent] = useState(false);
  const [form, setForm] = useState(defaultForm());
  const [fieldErrors, setFieldErrors] = useState({});

  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [actionBusyId, setActionBusyId] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [studentProjectDialog, setStudentProjectDialog] = useState(null);
  const [studentDialogEnrolled, setStudentDialogEnrolled] = useState(false);
  const [studentDialogBusy, setStudentDialogBusy] = useState(false);
  const [studentDialogEnrollmentKey, setStudentDialogEnrollmentKey] = useState("");
  const [unenrollRow, setUnenrollRow] = useState(null);
  const [unenrollBusy, setUnenrollBusy] = useState(false);
  const [unenrollConfirmText, setUnenrollConfirmText] = useState("");
  const [instructionsEditorReady, setInstructionsEditorReady] = useState(false);
  const [questionEditorReady, setQuestionEditorReady] = useState(false);
  const hasLoadedRef = useRef(false);
  const router = useRouter();

  const tinyApiKey = process.env.NEXT_PUBLIC_TINYMCE_API_KEY || "";
  const projectDateConstraints = useMemo(
    () => dateTimeInputConstraints(form.openAt, form.closeAt),
    [form.openAt, form.closeAt],
  );

  const patchProjectDateField = (patch) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (patch.openAt !== undefined || patch.closeAt !== undefined) {
        setFieldErrors((errs) => {
          const cleared = { ...errs };
          delete cleared.openAt;
          delete cleared.closeAt;
          return { ...cleared, ...validateDateTimeRange(next.openAt, next.closeAt).errors };
        });
      }
      return next;
    });
  };

  const load = useCallback(
    async (opts = { silent: false }) => {
      const silent = Boolean(opts.silent) || hasLoadedRef.current;
      if (silent) setRefetching(true);
      else setLoading(true);
      try {
        const qp = new URLSearchParams({
          page: String(page + 1),
          pageSize: String(rowsPerPage),
        });
        qp.set("filter", filter);
        if (isLecturer || isExaminer || isSystemAdmin) {
          qp.set("scope", staffScope);
          qp.set("purpose", staffPurpose);
          qp.set("status", staffStatus);
        }
        qp.set("openStatus", openStatus);
        const res = await fetch(`/api/projects?${qp.toString()}`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast({
            message: typeof data.error === "string" ? data.error : "Could not load projects.",
            severity: "error",
          });
          return;
        }
        setRows(Array.isArray(data.projects) ? data.projects : []);
        setTotal(Number(data.total || 0));
        hasLoadedRef.current = true;
      } finally {
        if (silent) setRefetching(false);
        else setLoading(false);
      }
    },
    [
      page,
      rowsPerPage,
      filter,
      isLecturer,
      isExaminer,
      isSystemAdmin,
      staffScope,
      staffPurpose,
      staffStatus,
      openStatus,
      showToast,
    ],
  );

  useEffect(() => {
    if (sessionLoading) return;
    void load();
  }, [load, sessionLoading]);

  useEffect(() => {
    setFilter("all");
    setPage(0);
    setStaffScope("all");
    setStaffPurpose("all");
    setStaffStatus("all");
    setOpenStatus("open");
  }, [activeRole]);

  useEffect(() => {
    const scope = searchParams.get("scope");
    if (scope === "student" && (isExaminer || isSystemAdmin)) {
      setStaffScope("student");
      setPage(0);
    }
  }, [searchParams, isExaminer, isSystemAdmin]);

  const resetEditorState = useCallback(() => {
    setEditingId("");
    setEditingManagedStudent(false);
    setForm(defaultForm());
    setFieldErrors({});
    setOpenEditor(false);
  }, []);

  const openCreate = () => {
    setEditingId("");
    setForm({
      ...defaultForm(),
      visibility: isStudent ? "PRIVATE" : "PUBLIC",
      purpose: isStudent ? "PRACTICE" : "PRACTICE",
      isPublished: isStudent,
    });
    setFieldErrors({});
    setInstructionsEditorReady(false);
    setQuestionEditorReady(false);
    setOpenEditor(true);
  };

  const openEdit = (row, managedStudent = false) => {
    setEditingId(row.id);
    setEditingManagedStudent(Boolean(managedStudent));
    setForm({
      name: row.name || "",
      description: row.description || "",
      organizationName: row.organizationName || "",
      purpose: row.purpose || (isExaminerLike ? "ASSIGNMENT" : "PRACTICE"),
      visibility: row.visibility || "PRIVATE",
      openAt: row.openAt ? new Date(row.openAt).toISOString().slice(0, 16) : "",
      closeAt: row.closeAt ? new Date(row.closeAt).toISOString().slice(0, 16) : "",
      durationHours: row.durationSeconds ? String(Math.floor(row.durationSeconds / 3600)) : "0",
      durationMinutes: row.durationSeconds ? String(Math.floor((row.durationSeconds % 3600) / 60)) : "0",
      instructions: row.instructions || "",
      questionText: row.questionText || "",
      questionFileUrl: row.questionFileUrl || "",
      enrollmentAccessKey: row.enrollmentKey || "",
      isPublished: Boolean(row.isPublished),
    });
    setFieldErrors({});
    setInstructionsEditorReady(false);
    setQuestionEditorReady(false);
    setOpenEditor(true);
  };

  const saveProject = async () => {
    const formRole = editingManagedStudent ? "EXAMINER" : activeRole;
    const nextErrors = validateClientForm(formRole, form);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }

    setBusyEditor(true);
    try {
      const payload = {
        ...form,
        name: String(form.name || "").trim(),
        description: String(form.description || "").trim(),
        organizationName: String(form.organizationName || "").trim(),
        instructions: String(form.instructions || "").trim(),
        questionText: String(form.questionText || "").trim(),
        questionFileUrl: String(form.questionFileUrl || "").trim(),
        enrollmentAccessKey: String(form.enrollmentAccessKey || "").trim().toUpperCase(),
        duration:
          formRole !== "STUDENT" &&
          Number(form.durationHours || 0) * 60 + Number(form.durationMinutes || 0) > 0
            ? `${Number(form.durationHours || 0)}h ${Number(form.durationMinutes || 0)}m`
            : "",
      };
      const res = await fetch(editingId ? `/api/projects/${editingId}` : "/api/projects", {
        method: editingId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.fieldErrors && typeof data.fieldErrors === "object") {
          setFieldErrors(data.fieldErrors);
        }
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save project.",
          severity: "error",
        });
        return;
      }
      showToast({
        message: editingId ? "Project updated." : "Project created.",
        severity: "success",
      });
      resetEditorState();
      await load({ silent: true });
    } finally {
      setBusyEditor(false);
    }
  };

  const uploadQuestionFile = async (file) => {
    if (!file) return;
    setUploadBusy(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/media/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Upload failed.",
          severity: "error",
        });
        return;
      }
      setForm((prev) => ({ ...prev, questionFileUrl: data.url || "" }));
      showToast({ message: "Question file uploaded.", severity: "success" });
    } finally {
      setUploadBusy(false);
    }
  };

  const runRowAction = async (row, action) => {
    setActionBusyId(`${row.id}:${action}`);
    try {
      let res;
      if (action === "enroll") {
        res = await fetch(`/api/projects/${row.id}/enroll`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enrollmentAccessKey: String(row.enrollmentAccessKey || "").trim().toUpperCase(),
          }),
        });
      } else if (action === "start") {
        res = await fetch(`/api/projects/${row.id}/start`, { method: "POST", credentials: "include" });
      } else {
        res = await fetch(`/api/projects/${row.id}/submit`, { method: "POST", credentials: "include" });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Action failed.",
          severity: "error",
        });
        return false;
      }
      showToast({ message: "Action completed.", severity: "success" });
      await load({ silent: true });
      if (action === "enroll") setStudentDialogEnrollmentKey("");
      return true;
    } finally {
      setActionBusyId("");
    }
  };

  const enterProjectWorkspace = useCallback(
    (projectId, opts = /** @type {{ organization?: boolean }} */ ({})) => {
      const asOrg = opts.organization !== false && isStudent;
      setSessionBlocking(
        true,
        asOrg ? "Entering organization…" : "Opening project…",
      );
      router.push(`/projects/${projectId}`);
    },
    [isStudent, router, setSessionBlocking],
  );

  const handleProjectOpen = (row) => {
    if (!isStudent) {
      enterProjectWorkspace(row.id, { organization: false });
      return;
    }

    const isStaffProject = ["LECTURER", "EXAMINER"].includes(String(row.creatorRole || ""));
    const isOwnProject = row.ownerUserId === session?.userId;
    const enrollmentStatus = enrollmentStatusForRow(row);
    const isEnrolled =
      Array.isArray(row.enrollments) &&
      row.enrollments.some((enrollment) => enrollment?.studentUserId === session?.userId);

    if (isStaffProject) {
      if (["IN_PROGRESS", "SUBMITTED"].includes(enrollmentStatus)) {
        enterProjectWorkspace(row.id);
        return;
      }
      setStudentProjectDialog(row);
      setStudentDialogEnrolled(isEnrolled);
      setStudentDialogEnrollmentKey("");
      return;
    }

    if (isOwnProject) {
      if (row.status === "NOT_STARTED") {
        setStudentProjectDialog(row);
        setStudentDialogEnrolled(true);
        return;
      }
      enterProjectWorkspace(row.id);
      return;
    }

    setStudentProjectDialog(row);
    setStudentDialogEnrolled(isEnrolled);
    setStudentDialogEnrollmentKey("");
  };

  const canStudentEnroll = (row) => {
    const state = openState(row);
    return state !== "CLOSED";
  };

  const canStudentStart = (row) => {
    const state = openState(row);
    return state === "OPEN";
  };

  const handleStudentDialogEnroll = async () => {
    if (!studentProjectDialog) return;
    if (!canStudentEnroll(studentProjectDialog)) {
      showToast({
        message: "This project is closed. You can no longer enroll.",
        severity: "error",
      });
      return;
    }
    const requiredKey = Boolean(studentProjectDialog.hasEnrollmentKey);
    const providedKey = String(studentDialogEnrollmentKey || "").trim().toUpperCase();
    if (requiredKey && !providedKey) {
      showToast({
        message: "Enter the enrollment key to enroll.",
        severity: "error",
      });
      return;
    }
    setStudentDialogBusy(true);
    try {
      const ok = await runRowAction(
        { ...studentProjectDialog, enrollmentAccessKey: providedKey },
        "enroll",
      );
      if (ok) setStudentDialogEnrolled(true);
    } finally {
      setStudentDialogBusy(false);
    }
  };

  const handleStudentDialogStart = async () => {
    if (!studentProjectDialog) return;
    if (!canStudentStart(studentProjectDialog)) {
      showToast({
        message: "You can only start a project when it is open.",
        severity: "error",
      });
      return;
    }
    setStudentDialogBusy(true);
    try {
      const ok = await runRowAction(studentProjectDialog, "start");
      if (ok) {
        const projectId = studentProjectDialog.id;
        setStudentProjectDialog(null);
        enterProjectWorkspace(projectId);
      }
    } finally {
      setStudentDialogBusy(false);
    }
  };

  const confirmUnenroll = async () => {
    if (!unenrollRow) return;
    if (unenrollConfirmText !== "UNENROLL") {
      showToast({
        message: 'Type "UNENROLL" in all caps to confirm.',
        severity: "error",
      });
      return;
    }
    setUnenrollBusy(true);
    try {
      const res = await fetch(`/api/projects/${unenrollRow.id}/unenroll`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmText: unenrollConfirmText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not unenroll.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Unenrolled successfully.", severity: "success" });
      setUnenrollRow(null);
      setUnenrollConfirmText("");
      await load({ silent: true });
    } finally {
      setUnenrollBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteRow) return;
    if (deleteConfirmText !== "DELETE") {
      showToast({
        message: "Type DELETE in all caps to confirm deletion.",
        severity: "error",
      });
      return;
    }
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/projects/${deleteRow.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmText: deleteConfirmText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not delete project.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Project deleted.", severity: "success" });
      setDeleteRow(null);
      setDeleteConfirmText("");
      await load({ silent: true });
    } finally {
      setDeleteBusy(false);
    }
  };

  const canManageStudentSettings = useMemo(
    () => (row) => {
      if (row.creatorRole !== "STUDENT") return false;
      if (isSystemAdmin) return true;
      if (isExaminer && row.visibility === "PUBLIC") return true;
      return false;
    },
    [isSystemAdmin, isExaminer],
  );

  const canEditOrDelete = useMemo(
    () => (row) => {
      if (isStudent) {
        return row.ownerUserId === session?.userId && row.creatorRole === "STUDENT";
      }
      if (isLecturer) {
        return (
          row.ownerUserId === session?.userId &&
          (row.creatorRole === "LECTURER" ||
            (row.creatorRole === "EXAMINER" && row.purpose === "PRACTICE"))
        );
      }
      if (isSystemAdmin) return row.creatorRole === "EXAMINER";
      if (isExaminer) {
        return row.ownerUserId === session?.userId && row.creatorRole === "EXAMINER";
      }
      return false;
    },
    [isStudent, isLecturer, isExaminer, isSystemAdmin, session?.userId],
  );

  if (sessionLoading || loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy="true" role="status">
        <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {canCreate ? (
          <Button
            type="button"
            variant="contained"
            startIcon={<AddRounded />}
            onClick={openCreate}
            className="w-full sm:w-auto"
            title="Create a new project"
          >
            Add project
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outlined"
          startIcon={refetching ? <CircularProgress size={16} /> : <RefreshRounded />}
          onClick={() => load({ silent: true })}
          disabled={refetching}
          className="w-full sm:w-auto"
          title="Refresh projects"
        >
          Refresh
        </Button>
        {isStudent ? (
          <FormControl size="small" className="w-full sm:w-56" sx={themedTextFieldSx}>
            <InputLabel id="project-filter-label">Filter</InputLabel>
            <Select
              labelId="project-filter-label"
              label="Filter"
              value={filter}
              onChange={(e) => {
                setFilter(String(e.target.value || "all"));
                setPage(0);
              }}
              title="Filter projects list"
            >
              {filterOptions.map((f) => (
                <MenuItem key={f.value} value={f.value}>
                  {f.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}
        {isLecturer || isExaminer || isSystemAdmin ? (
          <FormControl size="small" className="w-full sm:w-44" sx={themedTextFieldSx}>
            <InputLabel id="project-scope-filter-label">Source</InputLabel>
            <Select
              labelId="project-scope-filter-label"
              label="Source"
              value={staffScope}
              onChange={(e) => {
                setStaffScope(String(e.target.value || "all"));
                setPage(0);
              }}
            >
              {STAFF_SCOPE_FILTERS.map((f) => (
                <MenuItem key={f.value} value={f.value}>
                  {f.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}
        {isStaffViewer ? (
          <FormControl size="small" className="w-full sm:w-44" sx={themedTextFieldSx}>
            <InputLabel id="project-purpose-filter-label">Purpose</InputLabel>
            <Select
              labelId="project-purpose-filter-label"
              label="Purpose"
              value={staffPurpose}
              onChange={(e) => {
                setStaffPurpose(String(e.target.value || "all"));
                setPage(0);
              }}
            >
              {staffPurposeFilters.map((f) => (
                <MenuItem key={f.value} value={f.value}>
                  {f.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}
        {isStaffViewer ? (
          <FormControl size="small" className="w-full sm:w-44" sx={themedTextFieldSx}>
            <InputLabel id="project-status-filter-label">Status</InputLabel>
            <Select
              labelId="project-status-filter-label"
              label="Status"
              value={staffStatus}
              onChange={(e) => {
                setStaffStatus(String(e.target.value || "all"));
                setPage(0);
              }}
            >
              {STAFF_STATUS_FILTERS.map((f) => (
                <MenuItem key={f.value} value={f.value}>
                  {f.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}
        <FormControl size="small" className="w-full sm:w-44" sx={themedTextFieldSx}>
          <InputLabel id="project-open-status-filter-label">Open status</InputLabel>
          <Select
            labelId="project-open-status-filter-label"
            label="Open status"
            value={openStatus}
            onChange={(e) => {
              setOpenStatus(String(e.target.value || "all"));
              setPage(0);
            }}
          >
            {OPEN_STATUS_FILTERS.map((f) => (
              <MenuItem key={f.value} value={f.value}>
                {f.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </div>

      <Box sx={{ position: "relative" }}>
        <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Project</TableCell>
                <TableCell>Purpose</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Visibility</TableCell>
                <TableCell>Published</TableCell>
                <TableCell>Open status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Duration</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const enrollmentStatus = enrollmentStatusForRow(row);
                const oState = openState(row);
                return (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <div className="min-w-[180px]">
                        <button
                          type="button"
                          onClick={() => handleProjectOpen(row)}
                          className="cursor-pointer text-left font-medium text-primary hover:underline"
                          title="Open project"
                        >
                          {row.name}
                        </button>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {row.owner?.firstName || ""} {row.owner?.lastName || ""}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{formatPurpose(row.purpose)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={isStudent && row.ownerUserId !== session?.userId ? enrollmentStatus : row.status}
                        color={statusChipColor(
                          isStudent && row.ownerUserId !== session?.userId ? enrollmentStatus : row.status,
                        )}
                        sx={{ "& .MuiChip-label": { fontSize: "0.68rem", px: 0.75 } }}
                      />
                    </TableCell>
                    <TableCell>{row.visibility}</TableCell>
                    <TableCell>{row.isPublished ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      <Chip size="small" label={openStateLabel(oState)} color={openStateColor(oState)} />
                    </TableCell>
                    <TableCell>{formatCalendarDate(row.createdAt)}</TableCell>
                    <TableCell>{formatDuration(row.durationSeconds)}</TableCell>
                    <TableCell align="right">
                      <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
                        {canManageStudentSettings(row) && !canEditOrDelete(row) ? (
                          <Tooltip title="Manage project settings">
                            <IconButton
                              size="small"
                              aria-label="Manage project settings"
                              onClick={() => openEdit(row, true)}
                              disabled={busyEditor}
                              color="primary"
                            >
                              <SettingsRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        {canEditOrDelete(row) ? (
                          <Tooltip title="Edit project">
                            <IconButton
                              size="small"
                              aria-label="Edit project"
                              onClick={() => openEdit(row)}
                              disabled={busyEditor}
                              color="primary"
                            >
                              <EditRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        {canEditOrDelete(row) ? (
                          <Tooltip title="Delete project">
                            <IconButton
                              size="small"
                              aria-label="Delete project"
                              color="error"
                              onClick={() => setDeleteRow(row)}
                              disabled={deleteBusy}
                            >
                              <DeleteOutlineRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        {isExaminerLike && row.creatorRole === "EXAMINER" ? (
                          <Tooltip title="View submissions">
                            <IconButton
                              size="small"
                              aria-label="View submissions"
                              onClick={() => router.push(`/projects/${row.id}/submissions`)}
                              color="secondary"
                            >
                              <GroupRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        {isStudent &&
                        ["LECTURER", "EXAMINER"].includes(String(row.creatorRole || "")) &&
                        Array.isArray(row.enrollments) &&
                        row.enrollments.some((enrollment) => enrollment?.studentUserId === session?.userId) ? (
                          <Tooltip title="Unenroll from project">
                            <IconButton
                              size="small"
                              aria-label="Unenroll from project"
                              onClick={() => setUnenrollRow(row)}
                              color="warning"
                            >
                              <LogoutRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Typography sx={adminMutedTextSx}>No projects found for this filter.</Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          {refetching ? (
            <Box sx={adminTableRefetchOverlaySx} role="status" aria-live="polite">
              <CircularProgress size={26} sx={adminLoadingSpinnerSx} />
            </Box>
          ) : null}
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_e, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[5, 10, 20, 50]}
        />
      </Box>

      <Dialog open={openEditor} onClose={() => (busyEditor ? null : resetEditorState())} fullWidth maxWidth="md">
        <DialogTitle>
          {editingId
            ? editingManagedStudent
              ? "Manage student project settings"
              : "Edit project"
            : "Create project"}
        </DialogTitle>
        <DialogContent dividers sx={adminDialogPaperSx} className="space-y-4">
          <TextField
            margin="dense"
            label="Project name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            error={Boolean(fieldErrors.name)}
            helperText={fieldErrors.name || " "}
            fullWidth
            sx={themedTextFieldSx}
          />
          {isStudent ? (
            <TextField
              margin="dense"
              label="Organisation name"
              value={form.organizationName}
              onChange={(e) => setForm((prev) => ({ ...prev, organizationName: e.target.value }))}
              error={Boolean(fieldErrors.organizationName)}
              helperText={fieldErrors.organizationName || " "}
              fullWidth
              sx={themedTextFieldSx}
            />
          ) : null}
          <TextField
            margin="dense"
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            multiline
            minRows={2}
            fullWidth
            sx={themedTextFieldSx}
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormControl fullWidth margin="dense" sx={themedTextFieldSx}>
              <InputLabel id="purpose-label">Purpose</InputLabel>
              <Select
                labelId="purpose-label"
                label="Purpose"
                value={form.purpose}
                onChange={(e) => setForm((prev) => ({ ...prev, purpose: e.target.value }))}
                disabled={isStudent || isLecturer}
              >
                <MenuItem value="PRACTICE">Practice</MenuItem>
                {isExaminerLike ? <MenuItem value="ASSIGNMENT">Assignment</MenuItem> : null}
              </Select>
            </FormControl>
            {isStudent ? (
              <FormControl fullWidth margin="dense" sx={themedTextFieldSx}>
                <InputLabel id="visibility-label">Visibility</InputLabel>
                <Select
                  labelId="visibility-label"
                  label="Visibility"
                  value={form.visibility}
                  onChange={(e) => setForm((prev) => ({ ...prev, visibility: e.target.value }))}
                >
                  <MenuItem value="PRIVATE">Private</MenuItem>
                  <MenuItem value="PUBLIC">Public</MenuItem>
                </Select>
              </FormControl>
            ) : (
              <TextField
                margin="dense"
                label="Visibility"
                value="Public (auto for staff projects)"
                disabled
                fullWidth
                sx={themedTextFieldSx}
              />
            )}
          </div>
          {!isStudent ? (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <TextField
                  margin="dense"
                  label="Open date (optional)"
                  type="datetime-local"
                  value={form.openAt}
                  onChange={(e) => patchProjectDateField({ openAt: e.target.value })}
                  slotProps={{
                    inputLabel: { shrink: true },
                    input: { max: projectDateConstraints.startMax },
                  }}
                  error={Boolean(fieldErrors.openAt)}
                  helperText={fieldErrors.openAt || " "}
                  fullWidth
                  sx={themedTextFieldSx}
                />
                <TextField
                  margin="dense"
                  label="Close date (optional)"
                  type="datetime-local"
                  value={form.closeAt}
                  onChange={(e) => patchProjectDateField({ closeAt: e.target.value })}
                  slotProps={{
                    inputLabel: { shrink: true },
                    input: { min: projectDateConstraints.endMin },
                  }}
                  error={Boolean(fieldErrors.closeAt)}
                  helperText={fieldErrors.closeAt || " "}
                  fullWidth
                  sx={themedTextFieldSx}
                />
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <FormControl margin="dense" size="small" sx={{ minWidth: 120, ...themedTextFieldSx }}>
                  <InputLabel id="duration-hours-label">Hours</InputLabel>
                  <Select
                    labelId="duration-hours-label"
                    label="Hours"
                    value={form.durationHours}
                    onChange={(e) => setForm((prev) => ({ ...prev, durationHours: String(e.target.value) }))}
                  >
                    {Array.from({ length: 25 }, (_, i) => (
                      <MenuItem key={`h-${i}`} value={String(i)}>
                        {i}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl margin="dense" size="small" sx={{ minWidth: 120, ...themedTextFieldSx }}>
                  <InputLabel id="duration-minutes-label">Minutes</InputLabel>
                  <Select
                    labelId="duration-minutes-label"
                    label="Minutes"
                    value={form.durationMinutes}
                    onChange={(e) => setForm((prev) => ({ ...prev, durationMinutes: String(e.target.value) }))}
                  >
                    {Array.from({ length: 60 }, (_, i) => (
                      <MenuItem key={`m-${i}`} value={String(i)}>
                        {i}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography variant="caption" sx={{ ...adminMutedTextSx, mt: 2 }}>
                  Duration is required for assignment projects; optional for practice (open until close date).
                </Typography>
              </div>
              {fieldErrors.durationHours || fieldErrors.durationMinutes ? (
                <Typography color="error" variant="caption" className="block pt-1">
                  {fieldErrors.durationHours || fieldErrors.durationMinutes}
                </Typography>
              ) : null}
              <div className="pt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Duration preview: {Number(form.durationHours || 0)}h {Number(form.durationMinutes || 0)}m
              </div>
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Enrollment key (optional)
                </Typography>
                <Typography variant="caption" sx={adminMutedTextSx} className="block pt-1">
                  If set, students must provide this key when enrolling.
                </Typography>
                <div className="mt-2 flex flex-wrap items-start gap-2">
                  <TextField
                    margin="dense"
                    label="Enrollment key"
                    value={form.enrollmentAccessKey}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        enrollmentAccessKey: String(e.target.value || "").toUpperCase().slice(0, 5),
                      }))
                    }
                    placeholder="E.g. A7K2M"
                    error={Boolean(fieldErrors.enrollmentAccessKey)}
                    helperText={fieldErrors.enrollmentAccessKey || " "}
                    sx={{ minWidth: 220, ...themedTextFieldSx }}
                  />
                  <Button
                    variant="outlined"
                    startIcon={<AutorenewRounded />}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        enrollmentAccessKey: generateEnrollmentAccessKey(),
                      }))
                    }
                    title="Generate enrollment key"
                  >
                    Generate
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<ContentCopyRounded />}
                    disabled={!String(form.enrollmentAccessKey || "").trim()}
                    onClick={async () => {
                      const key = String(form.enrollmentAccessKey || "").trim().toUpperCase();
                      if (!key) return;
                      try {
                        await navigator.clipboard.writeText(key);
                        showToast({ message: "Enrollment key copied.", severity: "success" });
                      } catch {
                        showToast({ message: "Could not copy enrollment key.", severity: "error" });
                      }
                    }}
                    title="Copy enrollment key"
                  >
                    Copy key
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Typography variant="body2" sx={adminMutedTextSx}>
                  Instructions
                </Typography>
                {!instructionsEditorReady ? (
                  <Box sx={adminCenteredLoadingBoxSx}>
                    <CircularProgress size={24} sx={adminLoadingSpinnerSx} />
                  </Box>
                ) : null}
                <div className={instructionsEditorReady ? "" : "hidden"}>
                  <TinyEditor
                    apiKey={tinyApiKey}
                    value={form.instructions}
                    onInit={() => setInstructionsEditorReady(true)}
                    init={{
                      height: 220,
                      menubar: false,
                      plugins: "lists link code",
                      toolbar:
                        "undo redo | blocks | bold italic underline | bullist numlist | link | removeformat | code",
                      skin: "oxide",
                      content_style: "body { font-family: Inter, Arial, sans-serif; font-size: 14px; }",
                    }}
                    onEditorChange={(value) => setForm((prev) => ({ ...prev, instructions: value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Typography variant="body2" sx={adminMutedTextSx}>
                  Question
                </Typography>
                {!questionEditorReady ? (
                  <Box sx={adminCenteredLoadingBoxSx}>
                    <CircularProgress size={24} sx={adminLoadingSpinnerSx} />
                  </Box>
                ) : null}
                <div className={questionEditorReady ? "" : "hidden"}>
                  <TinyEditor
                    apiKey={tinyApiKey}
                    value={form.questionText}
                    onInit={() => setQuestionEditorReady(true)}
                    init={{
                      height: 220,
                      menubar: false,
                      plugins: "lists link code",
                      toolbar:
                        "undo redo | blocks | bold italic underline | bullist numlist | link | removeformat | code",
                      skin: "oxide",
                      content_style: "body { font-family: Inter, Arial, sans-serif; font-size: 14px; }",
                    }}
                    onEditorChange={(value) => setForm((prev) => ({ ...prev, questionText: value }))}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TextField
                  margin="dense"
                  label="Question file URL (optional)"
                  value={form.questionFileUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, questionFileUrl: e.target.value }))}
                  error={Boolean(fieldErrors.questionFileUrl)}
                  helperText={fieldErrors.questionFileUrl || " "}
                  className="min-w-[240px] flex-1"
                  sx={themedTextFieldSx}
                />
                <Button
                  component="label"
                  variant="outlined"
                  startIcon={uploadBusy ? <CircularProgress size={16} /> : <UploadFileRounded />}
                  disabled={uploadBusy}
                  title="Upload Word or PDF question file"
                >
                  Upload Word/PDF
                  <input
                    hidden
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      void uploadQuestionFile(file);
                      e.target.value = "";
                    }}
                  />
                </Button>
                {form.questionFileUrl ? (
                  <a
                    href={form.questionFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline"
                    title="Open uploaded file"
                  >
                    Open uploaded file
                  </a>
                ) : null}
              </div>
              <FormControl fullWidth margin="dense" sx={themedTextFieldSx}>
                <InputLabel id="publish-label">Published</InputLabel>
                <Select
                  labelId="publish-label"
                  label="Published"
                  value={form.isPublished ? "YES" : "NO"}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, isPublished: e.target.value === "YES" }))
                  }
                >
                  <MenuItem value="NO">No</MenuItem>
                  <MenuItem value="YES">Yes</MenuItem>
                </Select>
              </FormControl>
            </>
          ) : null}
        </DialogContent>
        <DialogActions sx={adminDialogPaperSx}>
          <Button onClick={resetEditorState} disabled={busyEditor}>
            Cancel
          </Button>
          <Button onClick={saveProject} variant="contained" disabled={busyEditor}>
            {busyEditor ? <CircularProgress size={18} color="inherit" /> : editingId ? "Save" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(deleteRow)}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteRow(null);
          setDeleteConfirmText("");
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Delete project</DialogTitle>
        <DialogContent dividers sx={adminDialogPaperSx}>
          <Typography>
            Are you sure you want to delete{" "}
            <span className="font-semibold">{deleteRow?.name || "this project"}</span>?
          </Typography>
          <Typography variant="body2" color="error" sx={{ mt: 1.5 }}>
            This action permanently deletes project data and student progress.
          </Typography>
          {["LECTURER", "EXAMINER"].includes(deleteRow?.creatorRole || "") ? (
            <Typography variant="body2" color="error" sx={{ mt: 0.75 }}>
              If students have started or submitted work, all that progress will be deleted too.
            </Typography>
          ) : null}
          <TextField
            margin="dense"
            label='Type "DELETE" to confirm'
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            fullWidth
            sx={{ ...themedTextFieldSx, mt: 2 }}
            error={Boolean(deleteConfirmText) && deleteConfirmText !== "DELETE"}
            helperText={
              deleteConfirmText && deleteConfirmText !== "DELETE"
                ? 'You must type "DELETE" in all caps.'
                : " "
            }
          />
        </DialogContent>
        <DialogActions sx={adminDialogPaperSx}>
          <Button
            onClick={() => {
              setDeleteRow(null);
              setDeleteConfirmText("");
            }}
            disabled={deleteBusy}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmDelete}
            disabled={deleteBusy || deleteConfirmText !== "DELETE"}
          >
            {deleteBusy ? <CircularProgress size={18} color="inherit" /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(studentProjectDialog)}
        onClose={() => (studentDialogBusy ? null : setStudentProjectDialog(null))}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Project details</DialogTitle>
        <DialogContent dividers sx={adminDialogPaperSx} className="space-y-3">
          {studentProjectDialog ? (
            <>
              <Typography variant="h6">{studentProjectDialog.name}</Typography>
              <Typography variant="body2" sx={adminMutedTextSx}>
                Purpose: {formatPurpose(studentProjectDialog.purpose)} · Visibility:{" "}
                {studentProjectDialog.visibility} · Published: {studentProjectDialog.isPublished ? "Yes" : "No"}
              </Typography>
              <Typography variant="body2" sx={adminMutedTextSx}>
                Status: {studentProjectDialog.status} · Open:{" "}
                {openStateLabel(openState(studentProjectDialog))} · Duration:{" "}
                {formatDuration(studentProjectDialog.durationSeconds)}
              </Typography>
              {studentProjectDialog.ownerUserId !== session?.userId &&
              openState(studentProjectDialog) === "CLOSED" ? (
                <Typography variant="body2" color="error">
                  This project is closed. You cannot enroll or start it.
                </Typography>
              ) : null}
              {openState(studentProjectDialog) === "NOT_YET" ? (
                <Typography variant="body2" color="error">
                  This project is not yet open. Start becomes available at open time.
                </Typography>
              ) : null}
              {studentProjectDialog.description ? (
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {studentProjectDialog.description}
                </Typography>
              ) : null}
              {studentProjectDialog.instructions ? (
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: studentProjectDialog.instructions }}
                />
              ) : null}
              {studentProjectDialog.questionText ? (
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: studentProjectDialog.questionText }}
                />
              ) : null}
              {studentProjectDialog.questionFileUrl ? (
                <a
                  href={studentProjectDialog.questionFileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline"
                >
                  Open question file
                </a>
              ) : null}
              {["LECTURER", "EXAMINER"].includes(String(studentProjectDialog.creatorRole || "")) &&
              !studentDialogEnrolled &&
              studentProjectDialog.hasEnrollmentKey ? (
                <TextField
                  margin="dense"
                  label="Enrollment key"
                  value={studentDialogEnrollmentKey}
                  onChange={(e) =>
                    setStudentDialogEnrollmentKey(
                      String(e.target.value || "").toUpperCase().slice(0, 5),
                    )
                  }
                  placeholder="Enter enrollment key"
                  fullWidth
                  sx={themedTextFieldSx}
                  helperText="This project requires an enrollment key."
                />
              ) : null}
            </>
          ) : null}
        </DialogContent>
        <DialogActions sx={adminDialogPaperSx}>
          <Button onClick={() => setStudentProjectDialog(null)} disabled={studentDialogBusy}>
            Close
          </Button>
          {studentProjectDialog ? (
            ["LECTURER", "EXAMINER"].includes(String(studentProjectDialog.creatorRole || "")) &&
            !studentDialogEnrolled ? (
              <Button
                variant="contained"
                onClick={handleStudentDialogEnroll}
                disabled={studentDialogBusy || !canStudentEnroll(studentProjectDialog)}
                startIcon={<HowToRegRounded />}
              >
                {studentDialogBusy ? <CircularProgress size={18} color="inherit" /> : "Enroll to project"}
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={handleStudentDialogStart}
                disabled={studentDialogBusy || !canStudentStart(studentProjectDialog)}
                startIcon={<PlayArrowRounded />}
              >
                {studentDialogBusy ? <CircularProgress size={18} color="inherit" /> : "Start project"}
              </Button>
            )
          ) : null}
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(unenrollRow)}
        onClose={() => {
          if (unenrollBusy) return;
          setUnenrollRow(null);
          setUnenrollConfirmText("");
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Unenroll from project</DialogTitle>
        <DialogContent dividers sx={adminDialogPaperSx}>
          <Typography>
            You are about to unenroll from{" "}
            <span className="font-semibold">{unenrollRow?.name || "this project"}</span>.
          </Typography>
          <Typography variant="body2" color="error" sx={{ mt: 1.25 }}>
            All your progress and submission data for this project will be permanently deleted.
          </Typography>
          <TextField
            margin="dense"
            label='Type "UNENROLL" to confirm'
            value={unenrollConfirmText}
            onChange={(e) => setUnenrollConfirmText(e.target.value)}
            fullWidth
            sx={{ ...themedTextFieldSx, mt: 2 }}
            error={Boolean(unenrollConfirmText) && unenrollConfirmText !== "UNENROLL"}
            helperText={
              unenrollConfirmText && unenrollConfirmText !== "UNENROLL"
                ? 'You must type "UNENROLL" in all caps.'
                : " "
            }
          />
        </DialogContent>
        <DialogActions sx={adminDialogPaperSx}>
          <Button
            onClick={() => {
              setUnenrollRow(null);
              setUnenrollConfirmText("");
            }}
            disabled={unenrollBusy}
          >
            Cancel
          </Button>
          <Button
            color="warning"
            variant="contained"
            onClick={confirmUnenroll}
            disabled={unenrollBusy || unenrollConfirmText !== "UNENROLL"}
          >
            {unenrollBusy ? <CircularProgress size={18} color="inherit" /> : "Unenroll"}
          </Button>
        </DialogActions>
      </Dialog>

    </div>
  );
}

