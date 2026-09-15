"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AssignmentLateRounded from "@mui/icons-material/AssignmentLateRounded";
import { BRAND_CARD_CLASS, BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";
import { BRAND_PAGE_LEAD_CLASS } from "@/components/layout/dashboard-page-intro";

/**
 * Dashboard tile: pending workflow tasks with a corner count badge.
 * @param {{ projectId: string; href?: string }} p
 */
export function OrgPendingTasksCard({ projectId, href }) {
  const [count, setCount] = useState(/** @type {number | null} */ (null));
  const tasksHref = href || `/projects/${projectId}/tasks`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/tasks`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setCount(0);
          return;
        }
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        setCount(typeof data.total === "number" ? data.total : tasks.length);
      } catch {
        if (!cancelled) setCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const display = count == null ? "…" : String(count);

  return (
    <Link
      href={tasksHref}
      className={`${BRAND_CARD_CLASS} relative block cursor-pointer p-4 sm:p-5 transition hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
      title="Open My Tasks"
    >
      <span
        className="absolute right-3 top-3 inline-flex min-h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 text-xs font-bold text-white"
        aria-label={`${display} pending tasks`}
      >
        {display}
      </span>
      <div className="flex items-start gap-3 pr-10">
        <AssignmentLateRounded className="mt-0.5 text-primary" aria-hidden />
        <div>
          <h2 className={BRAND_SECTION_TITLE_CLASS}>Pending tasks</h2>
          <p className={`mt-1 ${BRAND_PAGE_LEAD_CLASS}`}>
            Actions waiting for your role. Open My Tasks to review them.
          </p>
        </div>
      </div>
    </Link>
  );
}
