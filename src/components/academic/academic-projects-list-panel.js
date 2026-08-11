"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
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
          Work happens in My Organisation. Progress reflects your real procurement activity for the
          current academic year.
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
            <li key={p.id} className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className={BRAND_SECTION_TITLE_CLASS}>{p.name}</h2>
                  {p.description ? (
                    <p className={`mt-1 ${BRAND_PAGE_LEAD_CLASS}`}>{p.description}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Chip size="small" color="primary" label={p.status?.label || "—"} />
                    {p.durationSeconds ? (
                      <Chip
                        size="small"
                        label={`Timed · ${Math.round(p.durationSeconds / 60)} min`}
                      />
                    ) : null}
                    {p.attemptCount > 0 ? (
                      <Chip size="small" label={`Attempts: ${p.attemptCount}`} />
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {p.openAt ? `Opens ${fmt(p.openAt)}` : "Open"}
                    {p.closeAt ? ` · Closes ${fmt(p.closeAt)}` : ""}
                  </p>
                </div>
                <Button
                  component={Link}
                  href={p.href}
                  variant="contained"
                  className={`${BRAND_BTN_PRIMARY_CLASS} cursor-pointer`}
                >
                  Open
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** @param {unknown} v */
function fmt(v) {
  try {
    const d = typeof v === "string" ? parseISO(v) : new Date(/** @type {any} */ (v));
    return format(d, "MMM d, yyyy");
  } catch {
    return "—";
  }
}
