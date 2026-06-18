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
  const isSubmissions = pathname.endsWith("/submissions");
  const tabBase = "rounded-md px-3 py-1.5 text-sm font-medium transition";

  return (
    <div className={`${BRAND_CARD_CLASS} p-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/projects/${projectId}`}
          className={`${tabBase} ${!isSubmissions ? BRAND_NAV_ACTIVE_CLASS : BRAND_NAV_INACTIVE_CLASS}`}
          title="View project details"
          aria-current={!isSubmissions ? "page" : undefined}
        >
          Details
        </Link>
        {canSeeSubmissionsTab ? (
          <Link
            href={`/projects/${projectId}/submissions`}
            className={`${tabBase} ${isSubmissions ? BRAND_NAV_ACTIVE_CLASS : BRAND_NAV_INACTIVE_CLASS}`}
            title="View project submissions"
            aria-current={isSubmissions ? "page" : undefined}
          >
            Submissions
          </Link>
        ) : null}
      </div>
    </div>
  );
}
