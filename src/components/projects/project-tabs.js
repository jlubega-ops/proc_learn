"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BRAND_CARD_CLASS,
  BRAND_NAV_ACTIVE_CLASS,
  BRAND_NAV_INACTIVE_CLASS,
} from "@/lib/brand-ui";

export function ProjectTabs({ projectId, canSeeSubmissionsTab }) {
  const pathname = usePathname() || `/projects/${projectId}`;
  const isParticipants = pathname.includes("/participants") || pathname.endsWith("/submissions");
  const isAssessment = pathname.endsWith("/assessment");
  const isResults = pathname.endsWith("/results");
  const isDetails = !isParticipants && !isAssessment && !isResults;
  const tabBase = "rounded-md px-3 py-1.5 text-sm font-medium transition";

  return (
    <div className={`${BRAND_CARD_CLASS} p-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/projects/${projectId}`}
          className={`${tabBase} ${isDetails ? BRAND_NAV_ACTIVE_CLASS : BRAND_NAV_INACTIVE_CLASS}`}
          title="View project details"
          aria-current={isDetails ? "page" : undefined}
        >
          Details
        </Link>
        {canSeeSubmissionsTab ? (
          <>
            <Link
              href={`/projects/${projectId}/participants`}
              className={`${tabBase} ${isParticipants ? BRAND_NAV_ACTIVE_CLASS : BRAND_NAV_INACTIVE_CLASS}`}
              title="View enrolled students and attempts"
              aria-current={isParticipants ? "page" : undefined}
            >
              Participants
            </Link>
            <Link
              href={`/projects/${projectId}/assessment`}
              className={`${tabBase} ${isAssessment ? BRAND_NAV_ACTIVE_CLASS : BRAND_NAV_INACTIVE_CLASS}`}
              title="Configure assessment scoring"
              aria-current={isAssessment ? "page" : undefined}
            >
              Scoring
            </Link>
            <Link
              href={`/projects/${projectId}/results`}
              className={`${tabBase} ${isResults ? BRAND_NAV_ACTIVE_CLASS : BRAND_NAV_INACTIVE_CLASS}`}
              title="View enrolled student results for this project"
              aria-current={isResults ? "page" : undefined}
            >
              Results
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}
