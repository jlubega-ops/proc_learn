"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Chip from "@mui/material/Chip";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import GroupsRounded from "@mui/icons-material/GroupsRounded";
import TuneRounded from "@mui/icons-material/TuneRounded";
import AssessmentRounded from "@mui/icons-material/AssessmentRounded";
import { BRAND_CARD_CLASS } from "@/lib/brand-ui";

/**
 * @typedef {{
 *   name: string;
 *   organizationName?: string | null;
 *   purpose: string;
 *   windowState: 'upcoming' | 'open' | 'closed';
 *   facts: { label: string; value: string }[];
 * }} ProjectHeaderInfo
 */

const WINDOW_CHIP = {
  upcoming: { label: "Upcoming", color: "warning" },
  open: { label: "Open", color: "primary" },
  closed: { label: "Closed", color: "error" },
};

/**
 * Staff project header with section tabs (Details · Participants · Scoring · Results).
 * @param {{ projectId: string; canSeeSubmissionsTab: boolean; header?: ProjectHeaderInfo | null }} p
 */
export function ProjectTabs({ projectId, canSeeSubmissionsTab, header = null }) {
  const pathname = usePathname() || `/projects/${projectId}`;
  const base = `/projects/${projectId}`;
  const isParticipants = pathname.startsWith(`${base}/participants`) || pathname === `${base}/submissions`;
  const isAssessment = pathname === `${base}/assessment`;
  const isResults = pathname === `${base}/results`;
  const isDetails = !isParticipants && !isAssessment && !isResults;

  const tabs = [
    { href: base, label: "Details", title: "Project details", Icon: InfoOutlined, active: isDetails },
    ...(canSeeSubmissionsTab
      ? [
          {
            href: `${base}/participants`,
            label: "Participants",
            title: "Enrolled students and attempts",
            Icon: GroupsRounded,
            active: isParticipants,
          },
          {
            href: `${base}/assessment`,
            label: "Scoring",
            title: "Assessment scoring setup",
            Icon: TuneRounded,
            active: isAssessment,
          },
          {
            href: `${base}/results`,
            label: "Results",
            title: "Student results for this project",
            Icon: AssessmentRounded,
            active: isResults,
          },
        ]
      : []),
  ];

  const windowChip = header ? WINDOW_CHIP[header.windowState] || WINDOW_CHIP.open : null;

  return (
    <div className={`${BRAND_CARD_CLASS} overflow-hidden`}>
      {header ? (
        <div className="border-t-[3px] border-t-brand-blue px-4 pb-3 pt-4 sm:px-5">
          <Link
            href="/projects"
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary hover:underline"
            title="Back to Projects"
          >
            <ArrowBackRounded sx={{ fontSize: 16 }} aria-hidden />
            Back to Projects
          </Link>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="break-words text-lg font-semibold text-foreground sm:text-xl">
                {header.name}
              </h1>
              {header.organizationName && header.organizationName !== header.name ? (
                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                  {header.organizationName}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                label={String(header.purpose).toUpperCase() === "ASSESSMENT" ? "Assessment" : "Practice"}
              />
              {windowChip ? (
                <Chip size="small" color={/** @type {any} */ (windowChip.color)} label={windowChip.label} />
              ) : null}
            </div>
          </div>
          {header.facts.length ? (
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {header.facts.map((f) => (
                <div key={f.label} className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {f.label}
                  </dt>
                  <dd className="break-words font-medium text-foreground">{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
      <nav
        aria-label="Project sections"
        className="flex overflow-x-auto border-t border-[color:var(--border-subtle)] px-2 sm:px-3"
      >
        {tabs.map(({ href, label, title, Icon, active }) => (
          <Link
            key={href}
            href={href}
            title={title}
            aria-current={active ? "page" : undefined}
            className={`-mb-px inline-flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "border-primary text-primary"
                : "border-transparent text-zinc-600 hover:border-zinc-300 hover:text-foreground dark:text-zinc-300 dark:hover:border-zinc-600"
            }`}
          >
            <Icon aria-hidden sx={{ fontSize: 18 }} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
