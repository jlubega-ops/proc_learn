"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectTabs({ projectId, canSeeSubmissionsTab }) {
  const pathname = usePathname() || `/projects/${projectId}`;
  const isSubmissions = pathname.endsWith("/submissions");

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/projects/${projectId}`}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            !isSubmissions
              ? "bg-[#008bd0]/15 text-[#008bd0] dark:bg-[#008bd0]/25"
              : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          }`}
          title="View project details"
          aria-current={!isSubmissions ? "page" : undefined}
        >
          Details
        </Link>
        {canSeeSubmissionsTab ? (
          <Link
            href={`/projects/${projectId}/submissions`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              isSubmissions
                ? "bg-[#008bd0]/15 text-[#008bd0] dark:bg-[#008bd0]/25"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            }`}
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

