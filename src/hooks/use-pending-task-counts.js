"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const TASKS_CHANGED_EVENT = "proc-learn:org-tasks-changed";
const POLL_MS = 30_000;

/** Ask the sidebar to refresh pending-task badges (call after a task decision). */
export function notifyOrgTasksChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
}

/**
 * Pending workflow task counts for the signed-in org user, keyed by sidebar href.
 * @param {string} projectId
 * @param {boolean} enabled
 * @returns {Record<string, number>}
 */
export function usePendingTaskCounts(projectId, enabled) {
  const pathname = usePathname();
  const [byHref, setByHref] = useState(/** @type {Record<string, number>} */ ({}));
  const active = Boolean(enabled && projectId);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let inFlight = false;

    const load = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const res = await fetch(`/api/projects/${projectId}/tasks/counts`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && data?.byHref && typeof data.byHref === "object") {
          setByHref(data.byHref);
        }
      } catch {
        // Badges are best-effort; keep the last known counts offline.
      } finally {
        inFlight = false;
      }
    };

    void load();
    const timer = window.setInterval(load, POLL_MS);
    window.addEventListener(TASKS_CHANGED_EVENT, load);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(TASKS_CHANGED_EVENT, load);
      window.removeEventListener("focus", load);
    };
  }, [active, projectId, pathname]);

  return active ? byHref : {};
}
