"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { startVisibleInterval } from "@/lib/visible-interval";

const POLL_MS = 60_000;
/** Navigating between pages reuses counts this fresh instead of refetching. */
const FRESH_MS = 20_000;

/** @type {{ at: number; byHref: Record<string, number> }} */
const cache = { at: 0, byHref: {} };

/**
 * Open Practice / Assessment project counts for the signed-in student, keyed by sidebar href.
 * @param {boolean} enabled
 * @returns {Record<string, number>}
 */
export function useStudentAcademicCounts(enabled) {
  const pathname = usePathname();
  const [byHref, setByHref] = useState(() => cache.byHref);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let inFlight = false;

    const load = async (force = false) => {
      if (inFlight || document.visibilityState === "hidden") return;
      if (!force && Date.now() - cache.at < FRESH_MS) return;
      inFlight = true;
      try {
        const res = await fetch("/api/academic/nav-counts", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.byHref && typeof data.byHref === "object") {
          cache.at = Date.now();
          cache.byHref = data.byHref;
          if (!cancelled) setByHref(data.byHref);
        }
      } catch {
        // Badges are best-effort; keep the last known counts offline.
      } finally {
        inFlight = false;
      }
    };

    void load();
    const stop = startVisibleInterval(() => void load(true), POLL_MS);
    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, pathname]);

  return enabled ? byHref : {};
}
