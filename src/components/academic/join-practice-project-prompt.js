"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { useToast } from "@/components/providers/toast-provider";
import { adminDialogPaperSx, adminMutedTextSx } from "@/lib/admin-mui-surfaces";
import { ROLE } from "@/lib/roles";

const DISMISS_KEY = "proc_learn_practice_join_dismissed";

/**
 * On student login: ask whether to join a published Practice project or stay in My Organisation.
 */
export function JoinPracticeProjectPrompt() {
  const router = useRouter();
  const { session, loading, refresh } = useAuthSession();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const activeRole = session?.activeRole || "";
  const isStudent =
    !loading && session?.authenticated === true && activeRole === ROLE.STUDENT;
  const isStudentMode = Boolean(session?.isStudentMode);
  const prompt = session?.practiceJoinPrompt || null;
  const locked = Boolean(session?.assessmentLocked);

  useEffect(() => {
    if (!isStudent || isStudentMode || locked || !prompt?.academicProjectId) {
      setOpen(false);
      return;
    }
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1") {
      setOpen(false);
      return;
    }
    setOpen(true);
  }, [isStudent, isStudentMode, locked, prompt?.academicProjectId]);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  async function goPersonal() {
    setBusy(true);
    try {
      const res = await fetch("/api/student/active-org", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "personal" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not open your organisation.",
          severity: "error",
        });
        return;
      }
      dismiss();
      await refresh();
      showToast({ message: "Opened your organisation.", severity: "success" });
      router.replace("/");
    } finally {
      setBusy(false);
    }
  }

  async function joinPractice() {
    if (!prompt?.academicProjectId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/student/active-org", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          academicProjectId: prompt.academicProjectId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not join the practice project.",
          severity: "error",
        });
        return;
      }
      dismiss();
      await refresh();
      showToast({ message: "Joined the practice organisation.", severity: "success" });
      router.replace(typeof data.redirectTo === "string" ? data.redirectTo : "/organisation");
    } finally {
      setBusy(false);
    }
  }

  if (!open || !prompt) return null;

  const orgName = prompt.organizationName || prompt.name;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) void goPersonal();
      }}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: adminDialogPaperSx } }}
    >
      <DialogTitle>Join practice project?</DialogTitle>
      <DialogContent>
        <Typography sx={adminMutedTextSx}>
          A practice project is available: <strong>{prompt.name}</strong>. You can work in{" "}
          <strong>{orgName}</strong> as your own organisation shell, or continue in your default
          organisation.
        </Typography>
      </DialogContent>
      <DialogActions className="flex flex-wrap gap-2 px-6 pb-4">
        <Button
          type="button"
          disabled={busy}
          className="cursor-pointer disabled:cursor-not-allowed"
          onClick={() => void goPersonal()}
        >
          {busy ? <CircularProgress size={16} /> : null}
          Go to my organisation
        </Button>
        <Button
          type="button"
          variant="contained"
          disabled={busy}
          className="cursor-pointer disabled:cursor-not-allowed"
          onClick={() => void joinPractice()}
        >
          Join practice
        </Button>
      </DialogActions>
    </Dialog>
  );
}
