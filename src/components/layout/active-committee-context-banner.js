"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { useToast } from "@/components/providers/toast-provider";
import { formatCommitteeSeatLabel } from "@/lib/projects/committee-context";

export const OPEN_COMMITTEE_CONTEXT_EVENT = "proc-learn:open-committee-context";

/**
 * Banner while an organisation user has switched into a committee seat.
 */
export function ActiveCommitteeContextBanner() {
  const { session, refresh } = useAuthSession();
  const { showToast } = useToast();
  const [clearing, setClearing] = useState(false);

  const isOrg = session?.authenticated && session?.sessionType === "org";
  const committee = session?.activeCommittee;
  if (!isOrg || !committee?.id || !session?.projectId) return null;

  const seat =
    committee.committeeRoleLabel || formatCommitteeSeatLabel(committee.committeeRole);
  const orgRole = session.orgRoleName || "your organisation role";

  async function clearContext() {
    setClearing(true);
    try {
      const res = await fetch(`/api/projects/${session.projectId}/my-committee-context`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ committeeId: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message:
            typeof data.error === "string" ? data.error : "Could not clear committee context.",
          severity: "error",
        });
        return;
      }
      await refresh();
      showToast({ message: "Back to organisational role only.", severity: "success" });
    } finally {
      setClearing(false);
    }
  }

  function openSwitch() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(OPEN_COMMITTEE_CONTEXT_EVENT));
    }
  }

  return (
    <div
      className="z-20 shrink-0 border-b border-brand-yellow/60 bg-[color-mix(in_oklab,var(--brand-yellow)_18%,var(--surface-elevated))] text-foreground"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
            Committee seat active
          </p>
          <p className="truncate text-sm font-semibold">
            Switched to {committee.name} ({seat}). Your org role remains {orgRole}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            type="button"
            size="small"
            variant="outlined"
            className="cursor-pointer"
            onClick={openSwitch}
            title="Switch committee seat"
          >
            Switch seat
          </Button>
          <Button
            type="button"
            size="small"
            variant="contained"
            color="warning"
            className="cursor-pointer disabled:cursor-not-allowed"
            disabled={clearing}
            onClick={() => void clearContext()}
            startIcon={clearing ? <CircularProgress size={14} color="inherit" /> : null}
            title="Return to organisation role only"
          >
            Clear seat
          </Button>
        </div>
      </div>
    </div>
  );
}
