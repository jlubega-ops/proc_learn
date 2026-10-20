"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { revalidateApi } from "@/lib/api-client-cache";
import { startVisibleInterval } from "@/lib/visible-interval";

const TASKS_CHANGED_EVENT = "proc-learn:org-tasks-changed";
const POLL_MS = 30_000;
/** Navigating between pages reuses counts this fresh instead of refetching. */
const FRESH_MS = 10_000;

/** @type {Map<string, { at: number; byHref: Record<string, number> }>} */
const cache = new Map();

/**
 * Ask the sidebar to refresh pending-task badges, and refresh cached org list GETs
 * so budgets/plans/reqs/tasks are not stale after a decision (authz still on each request).
 * @param {string} [projectId]
 */
export function notifyOrgTasksChanged(projectId) {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
  if (typeof projectId === "string" && projectId) {
    void revalidateApi(
      `/api/projects/${projectId}/tasks`,
      `/api/projects/${projectId}/budgets`,
      `/api/projects/${projectId}/procurement-plans`,
      `/api/projects/${projectId}/requisitions`,
      `/api/projects/${projectId}/procurements`,
      `/api/projects/${projectId}/budget-lines`,
      "/api/projects/org-notifications",
    );
  } else {
    void revalidateApi("/api/projects/org-notifications");
  }
}

/**
 * Pending workflow task counts for the signed-in org user, keyed by sidebar href.
 * @param {string} projectId
 * @param {boolean} enabled
 * @param {string} [contextKey] acting context (org role + committee seat); counts reload when it changes
 * @returns {Record<string, number>}
 */
export function usePendingTaskCounts(projectId, enabled, contextKey = "") {
  const pathname = usePathname();
  const key = `${projectId}|${contextKey}`;
  const [state, setState] = useState(() => ({ key, byHref: cache.get(key)?.byHref || {} }));
  const active = Boolean(enabled && projectId);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let inFlight = false;

    const load = async (force = false) => {
      if (inFlight || document.visibilityState === "hidden") return;
      if (!force && Date.now() - (cache.get(key)?.at || 0) < FRESH_MS) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/projects/${projectId}/tasks/counts`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.byHref && typeof data.byHref === "object") {
          cache.set(key, { at: Date.now(), byHref: data.byHref });
          if (!cancelled) setState({ key, byHref: data.byHref });
        }
      } catch {
        // Badges are best-effort; keep the last known counts offline.
      } finally {
        inFlight = false;
      }
    };
    const onChanged = () => void load(true);

    void load();
    const stop = startVisibleInterval(onChanged, POLL_MS);
    window.addEventListener(TASKS_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      stop();
      window.removeEventListener(TASKS_CHANGED_EVENT, onChanged);
    };
  }, [active, projectId, key, pathname]);

  if (!active) return {};
  return state.key === key ? state.byHref : cache.get(key)?.byHref || {};
}
