import Link from "next/link";
import { APP_NAME } from "@/lib/appConfig";
import { getStudentAcademicContext } from "@/lib/academic/student-enrollment";
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
import { formatUserDisplayName } from "@/lib/user-display";

/**
 * Student / Student Mode home — actionable “what next?” (not a chart dashboard).
 *
 * @param {{
 *   user: { id: string; email?: string | null; firstName?: string; lastName?: string; middleName?: string | null };
 *   personalOrgName?: string | null;
 * }} props
 */
export async function StudentDashboardHome({ user, personalOrgName = null }) {
  let ayLabel = null;
  let enrolled = false;
  let joinNeeded = false;

  try {
    const ctx = await getStudentAcademicContext(user.id);
    ayLabel = ctx.academicYear?.label || ctx.enrollment?.academicYear?.label || null;
    enrolled = Boolean(ctx.enrolledInCurrentYear);
    joinNeeded = Boolean(ctx.joinPrompt);
  } catch {
    /* keep empty context */
  }

  const displayName = formatUserDisplayName(user) || "Student";
  const orgLabel = personalOrgName || "My Organisation";

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title={`Welcome, ${displayName}`}
        description={`Your ${APP_NAME} home. Choose organisation practice or academic work from your examiner.`}
      >
        {ayLabel ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Academic Year: {ayLabel}
          </p>
        ) : null}
      </DashboardPageIntro>

      {joinNeeded ? (
        <div
          className={`${BRAND_CARD_CLASS} border-brand-yellow/50 p-4 sm:p-5`}
          role="status"
        >
          <h2 className={BRAND_SECTION_TITLE_CLASS}>Join the current academic year</h2>
          <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
            A new academic year is available. Use the prompt above to join when you are ready.
            Your previous work stays available in history.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
          <h2 className={BRAND_SECTION_TITLE_CLASS}>My Organisation</h2>
          <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
            Run your simulated organisation — structure, users, and procurement setup for{" "}
            <span className="font-medium text-foreground">{orgLabel}</span>.
          </p>
          <Link
            href="/organisation"
            title="Open My Organisation"
            className={`${BRAND_BTN_PRIMARY_CLASS} mt-4 inline-flex cursor-pointer items-center rounded-lg px-4 py-2 text-sm font-semibold`}
          >
            Open organisation
          </Link>
        </section>

        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
          <h2 className={BRAND_SECTION_TITLE_CLASS}>My Academic Work</h2>
          <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
            Practice and assessment projects assigned by your examiner. Lists open here as they are
            published.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/academic/practice"
              title="Open Practice"
              className={`${BRAND_BTN_PRIMARY_CLASS} inline-flex cursor-pointer items-center rounded-lg px-4 py-2 text-sm font-semibold`}
            >
              Practice
            </Link>
            <Link
              href="/academic/assessments"
              title="Open Assessments"
              className="inline-flex cursor-pointer items-center rounded-lg border border-[color:var(--border-subtle)] bg-surface-card px-4 py-2 text-sm font-medium text-foreground"
            >
              Assessments
            </Link>
          </div>
          {!enrolled && ayLabel ? (
            <p className={`mt-3 text-sm ${BRAND_PAGE_LEAD_CLASS}`}>
              Enroll in the current academic year to keep academic work in the right year context.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

