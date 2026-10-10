"use client";

import { useEffect, useState } from "react";

const PROCESS_ACTIVATION_CHANGED_EVENT = "proc-learn:process-activation-changed";
const TTL_MS = 60_000;

/** @type {Map<string, { at: number; data: { active: string[]; names: Record<string, string> } }>} */
const cache = new Map();
/** @type {Map<string, Promise<{ active: string[]; names: Record<string, string> } | null>>} */
const inFlight = new Map();

/** Drop cached activation (call after an org admin activates / deactivates a process). */
export function notifyProcessActivationChanged() {
  cache.clear();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROCESS_ACTIVATION_CHANGED_EVENT));
  }
}

/** @param {string} projectId */
function fetchActivation(projectId) {
  const pending = inFlight.get(projectId);
  if (pending) return pending;
  const p = fetch(`/api/projects/${projectId}/org-process-status`, {
    credentials: "include",
    cache: "no-store",
  })
    .then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(body?.active)) return null;
      const data = { active: body.active, names: body.names || {} };
      cache.set(projectId, { at: Date.now(), data });
      return data;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(projectId));
  inFlight.set(projectId, p);
  return p;
}

/**
 * Which engine processes are active for the organisation.
 * Until loaded (or if the request fails) every process reads as active — the server stays the gate.
 *
 * @param {string | null | undefined} projectId
 * @returns {{ ready: boolean; isActive: (code: string) => boolean; inactiveTitle: (code: string) => string }}
 */
export function useProcessActivation(projectId) {
  const id = String(projectId || "");
  const [data, setData] = useState(() => cache.get(id)?.data || null);

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    const load = () => {
      const hit = cache.get(id);
      if (hit && Date.now() - hit.at < TTL_MS) {
        setData(hit.data);
        return;
      }
      void fetchActivation(id).then((next) => {
        if (!cancelled && next) setData(next);
      });
    };
    load();
    window.addEventListener(PROCESS_ACTIVATION_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(PROCESS_ACTIVATION_CHANGED_EVENT, load);
    };
  }, [id]);

  const activeSet = data ? new Set(data.active) : null;
  return {
    ready: Boolean(data),
    isActive: (code) => (activeSet ? activeSet.has(code) : true),
    inactiveTitle: (code) => `${data?.names?.[code] || "Process"} inactive`,
  };
}
