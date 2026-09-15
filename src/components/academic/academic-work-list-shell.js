import Link from "next/link";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
  BRAND_PAGE_LEAD_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { BRAND_BTN_PRIMARY_CLASS, BRAND_CARD_CLASS, BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";

/**
 * Shared empty/foundation panel for My Academic Work list pages (Phase 6).
 * Full enrollment/attempt UI arrives in later phases.
 *
 * @param {{
 *   title: string;
 *   description: string;
 *   emptyTitle: string;
 *   emptyBody: string;
 *   academicYearLabel?: string | null;
 *   enrolled?: boolean;
 * }} props
 */
export function AcademicWorkListShell({
  title,
  description,
  emptyTitle,
  emptyBody,
  academicYearLabel = null,
  enrolled = false,
}) {
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro hero title={title} description={description}>
        {academicYearLabel ? (
          <p className={`mt-3 text-sm text-zinc-600 dark:text-zinc-400`}>
            Academic Year: {academicYearLabel}
            {!enrolled ? (
              <span className="ml-2 text-brand-red">Not enrolled in the current year yet.</span>
            ) : null}
          </p>
        ) : (
          <p className={`mt-3 text-sm text-zinc-600 dark:text-zinc-400`}>
            Academic year context is not configured yet. Ask a system admin if this persists.
          </p>
        )}
      </DashboardPageIntro>

      <div className={`${BRAND_CARD_CLASS} p-4 sm:p-5`} role="status">
        <h2 className={BRAND_SECTION_TITLE_CLASS}>{emptyTitle}</h2>
        <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>{emptyBody}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/"
            className={`${BRAND_BTN_PRIMARY_CLASS} inline-flex cursor-pointer items-center rounded-lg px-4 py-2 text-sm font-semibold`}
            title="Back to Dashboard"
          >
            Back to Dashboard
          </Link>
          <Link
            href="/organisation"
            className="inline-flex cursor-pointer items-center rounded-lg border border-[color:var(--border-subtle)] bg-surface-card px-4 py-2 text-sm font-medium text-foreground"
            title="Open My Organisation"
          >
            My Organisation
          </Link>
        </div>
      </div>
    </div>
  );
}
