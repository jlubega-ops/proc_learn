"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Chip from "@mui/material/Chip";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import { format, parseISO } from "date-fns";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
  BRAND_PAGE_LEAD_CLASS,
} from "@/components/layout/dashboard-page-intro";
import {
  BRAND_BTN_PRIMARY_CLASS,
  BRAND_CARD_CLASS,
  BRAND_SECTION_TITLE_CLASS,
} from "@/lib/brand-ui";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
} from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";
import { formatDurationHms } from "@/lib/academic/attempt-timer-format";

/**
 * @param {{ purpose: 'PRACTICE' | 'ASSESSMENT'; title: string; description: string }} props
 */
export function AcademicProjectsListPanel({ purpose, title, description }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState(/** @type {any[]} */ ([]));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/academic/projects?purpose=${encodeURIComponent(purpose)}`,
        { credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not load projects.",
          severity: "error",
        });
        setProjects([]);
        return;
      }
      setProjects(Array.isArray(data.projects) ? data.projects : []);
    } finally {
      setLoading(false);
    }
  }, [purpose, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro hero title={title} description={description}>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Open a project to read instructions and the question. Starting an attempt moves you into
          that project&apos;s organisation (one project at a time). Practice and Assessments stay
          under My Academic Work in your default organisation.
        </p>
      </DashboardPageIntro>

      {loading ? (
        <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
          <CircularProgress sx={adminLoadingSpinnerSx} />
          <p className="mt-2 text-sm">Loading {title.toLowerCase()}…</p>
        </Box>
      ) : projects.length === 0 ? (
        <div className={`${BRAND_CARD_CLASS} p-4 sm:p-5`} role="status">
          <h2 className={BRAND_SECTION_TITLE_CLASS}>Nothing here yet</h2>
          <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
            When your examiner publishes {purpose === "ASSESSMENT" ? "assessments" : "practice work"}{" "}
            for the current period, they will appear here.
          </p>
          <Link
            href="/organisation"
            className={`${BRAND_BTN_PRIMARY_CLASS} mt-4 inline-flex cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold`}
          >
            My Organisation
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={p.href}
                title={`View ${p.name}`}
                className={`${BRAND_CARD_CLASS} group block cursor-pointer p-4 transition hover:border-primary/50 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-5`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className={`${BRAND_SECTION_TITLE_CLASS} group-hover:underline`}>{p.name}</h2>
                    {p.description ? (
                      <p className={`mt-1 line-clamp-2 ${BRAND_PAGE_LEAD_CLASS}`}>{p.description}</p>
                    ) : null}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-primary px-3 py-1.5 text-sm font-semibold text-primary transition group-hover:bg-primary group-hover:text-white">
                    View project
                    <ChevronRightRounded sx={{ fontSize: 18 }} aria-hidden />
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className={CARD_FACT_LABEL_CLASS}>Status</dt>
                    <dd className="mt-0.5">
                      <Chip size="small" color={statusChipColor(p.status?.key)} label={p.status?.label || "—"} />
                    </dd>
                  </div>
                  <div>
                    <dt className={CARD_FACT_LABEL_CLASS}>Time allowed</dt>
                    <dd className="mt-0.5 font-medium tabular-nums text-foreground">
                      {formatDurationHms(p.durationSeconds)}
                    </dd>
                  </div>
                  <div>
                    <dt className={CARD_FACT_LABEL_CLASS}>Opens on</dt>
                    <dd className="mt-0.5 font-medium text-foreground">
                      {p.openAt ? fmt(p.openAt) : "Now"}
                    </dd>
                  </div>
                  <div>
                    <dt className={CARD_FACT_LABEL_CLASS}>Ends on</dt>
                    <dd className="mt-0.5 font-medium text-foreground">
                      {p.closeAt ? fmt(p.closeAt) : "No end date"}
                    </dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CARD_FACT_LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

/**
 * @param {string | undefined} key
 * @returns {'warning' | 'primary' | 'success' | 'error'}
 */
function statusChipColor(key) {
  if (key === "in_progress") return "primary";
  if (key === "submitted" || key === "completed") return "success";
  if (key === "closed") return "error";
  return "warning";
}

/** @param {unknown} v */
function fmt(v) {
  try {
    const d = typeof v === "string" ? parseISO(v) : new Date(/** @type {any} */ (v));
    return format(d, "MMM d, yyyy h:mm a");
  } catch {
    return "—";
  }
}
