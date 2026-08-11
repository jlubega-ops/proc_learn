"use client";

import Button from "@mui/material/Button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import CircularProgress from "@mui/material/CircularProgress";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { useToast } from "@/components/providers/toast-provider";
import { BRAND_BTN_PRIMARY_CLASS } from "@/lib/brand-ui";
import { DEFAULT_POST_AUTH_PATH } from "@/lib/appConfig";

/**
 * Persistent Student Mode strip: indicator + return to Examiner/Admin.
 */
export function StudentModeBanner() {
  const router = useRouter();
  const { session, refresh, setSessionBlocking } = useAuthSession();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!session?.authenticated || !session.isStudentMode) return null;

  const returnRole = typeof session.returnRole === "string" ? session.returnRole : "";
  const returnLabel =
    typeof session.returnRoleLabel === "string" && session.returnRoleLabel
      ? session.returnRoleLabel
      : "Return";

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
    <div
      className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-yellow/60 bg-[color-mix(in_oklab,var(--brand-yellow)_18%,var(--surface-elevated))] px-3 py-2 text-sm text-foreground"
      role="status"
    >
      <div className="min-w-0">
        <p className="font-semibold text-foreground">Student Mode</p>
        <p className="text-xs text-zinc-700 dark:text-zinc-300">
          Viewing as a student. Your permanent account role has not changed.
        </p>
      </div>
      <Button
        type="button"
        variant="contained"
        size="small"
        disabled={busy || !returnRole}
        onClick={() => void returnToPermanent()}
        className={`${BRAND_BTN_PRIMARY_CLASS} cursor-pointer disabled:cursor-not-allowed`}
        title={returnLabel}
        startIcon={busy ? <CircularProgress size={14} color="inherit" /> : null}
      >
        {busy ? "Returning…" : returnLabel}
      </Button>
    </div>
  );
}
