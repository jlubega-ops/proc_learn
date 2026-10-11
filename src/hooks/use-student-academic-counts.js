"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const POLL_MS = 60_000;

/**
 * Open Practice / Assessment project counts for the signed-in student, keyed by sidebar href.
 * @param {boolean} enabled
 * @returns {Record<string, number>}
 */
export function useStudentAcademicCounts(enabled) {
  const pathname = usePathname();
  const [byHref, setByHref] = useState(/** @type {Record<string, number>} */ ({}));

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let inFlight = false;

    const load = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const res = await fetch("/api/academic/nav-counts", {
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
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [enabled, pathname]);

  return enabled ? byHref : {};
}
