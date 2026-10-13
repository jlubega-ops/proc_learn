"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import SchoolRounded from "@mui/icons-material/SchoolRounded";
import { useRouter } from "next/navigation";
import { useState } from "react";
import CircularProgress from "@mui/material/CircularProgress";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { useToast } from "@/components/providers/toast-provider";
import {
  StudentViewFields,
  useStudentViewOptions,
  validateStudentViewFields,
} from "@/components/academic/student-view-fields";
import { BRAND_BTN_PRIMARY_CLASS } from "@/lib/brand-ui";
import { adminDialogPaperSx } from "@/lib/admin-mui-surfaces";
import { DEFAULT_POST_AUTH_PATH } from "@/lib/appConfig";

/**
 * Persistent Student Mode strip: indicator, followed programme + return to Examiner/Admin.
 */
export function StudentModeBanner() {
  const router = useRouter();
  const { session, refresh, setSessionBlocking } = useAuthSession();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewBusy, setViewBusy] = useState(false);
  const [view, setView] = useState({ programmeId: "", campus: "" });
  const [viewErrors, setViewErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const options = useStudentViewOptions(viewOpen);

  if (!session?.authenticated || !session.isStudentMode) return null;

  const returnRole = typeof session.returnRole === "string" ? session.returnRole : "";
  const returnLabel =
    typeof session.returnRoleLabel === "string" && session.returnRoleLabel
      ? session.returnRoleLabel
      : "Return";
  const current = session.studentView || null;
  const programmeLabel = current
    ? current.programmeShortName || current.programmeName || "Programme"
    : null;

  function openView() {
    setView({ programmeId: current?.programmeId || "", campus: current?.campus || "" });
    setViewErrors({});
    setViewOpen(true);
  }

  async function saveView() {
    const fe = validateStudentViewFields(view);
    setViewErrors(fe);
    if (Object.keys(fe).length) return;
    setViewBusy(true);
    try {
      const res = await fetch("/api/user/student-view", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(view),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors && typeof data.fieldErrors === "object") setViewErrors(data.fieldErrors);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not change programme.",
          severity: "error",
        });
        return;
      }
      await refresh();
      router.refresh();
      setViewOpen(false);
      showToast({ message: "Programme updated.", severity: "success" });
    } finally {
      setViewBusy(false);
    }
  }

  async function returnToPermanent() {
    if (!returnRole || busy) return;
    setBusy(true);
    setSessionBlocking(true, "Leaving Student Mode…");
    try {
      const res = await fetch("/api/user/active-role", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: returnRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message:
            typeof data.error === "string" ? data.error : "Could not leave Student Mode.",
          severity: "error",
        });
        return;
      }
      await refresh();
      const nextPath =
        typeof data.defaultPath === "string" && data.defaultPath.startsWith("/")
          ? data.defaultPath
          : DEFAULT_POST_AUTH_PATH;
      router.replace(nextPath);
      showToast({ message: "You left Student Mode.", severity: "success" });
    } finally {
      setBusy(false);
      setSessionBlocking(false);
    }
  }

  return (
    <>
      <div
        className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-yellow/60 bg-[color-mix(in_oklab,var(--brand-yellow)_18%,var(--surface-elevated))] px-3 py-2 text-sm text-foreground"
        role="status"
      >
        <div className="min-w-0">
          <p className="font-semibold text-foreground">Student Mode</p>
          <p className="text-xs text-zinc-700 dark:text-zinc-300">
            {current ? (
              <>
                <span className="font-medium" title={current.programmeName || undefined}>
                  {programmeLabel}
                </span>
                {" · "}
                {current.campusLabel}
              </>
            ) : (
              <span className="font-medium text-brand-red">No programme chosen</span>
            )}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            type="button"
            variant={current ? "outlined" : "contained"}
            color={current ? "primary" : "warning"}
            size="small"
            startIcon={<SchoolRounded />}
            onClick={openView}
            disabled={busy}
            title="Programme and campus whose projects you see"
            className="flex-1 cursor-pointer disabled:cursor-not-allowed sm:flex-none"
          >
            {current ? "Change programme" : "Choose programme"}
          </Button>
          <Button
            type="button"
            variant="contained"
            size="small"
            disabled={busy || !returnRole}
            onClick={() => void returnToPermanent()}
            className={`${BRAND_BTN_PRIMARY_CLASS} flex-1 cursor-pointer disabled:cursor-not-allowed sm:flex-none`}
            title={returnLabel}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : null}
          >
            {busy ? "Returning…" : returnLabel}
          </Button>
        </div>
      </div>

      <Dialog
        open={viewOpen}
        onClose={() => !viewBusy && setViewOpen(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="student-view-title"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle id="student-view-title">Student Mode programme</DialogTitle>
        <DialogContent>
          <form
            noValidate
            className="pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              void saveView();
            }}
          >
            {options.loading ? (
              <div className="flex justify-center py-3" role="status" aria-busy="true">
                <CircularProgress size={24} aria-label="Loading programmes" />
              </div>
            ) : (
              <StudentViewFields
                value={view}
                onChange={(next) => {
                  setView(next);
                  if (next.programmeId) setViewErrors({});
                }}
                programmes={options.programmes}
                errors={viewErrors}
                disabled={viewBusy}
              />
            )}
          </form>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewOpen(false)} disabled={viewBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void saveView()}
            disabled={viewBusy || options.loading}
            startIcon={viewBusy ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {viewBusy ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
