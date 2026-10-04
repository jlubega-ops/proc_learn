import Link from "next/link";
import { getStudentAcademicContext } from "@/lib/academic/student-enrollment";
import { prisma } from "@/lib/prisma";
import { loadOrgProfile } from "@/lib/projects/org-profile";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
  BRAND_PAGE_LEAD_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgProfileView, orgProfileAdminLinks } from "@/components/projects/org-profile-view";
import {
  BRAND_BTN_PRIMARY_CLASS,
  BRAND_CARD_CLASS,
  BRAND_SECTION_TITLE_CLASS,
} from "@/lib/brand-ui";
import { formatUserDisplayName } from "@/lib/user-display";

/**
 * Student home — the personal organisation profile plus academic work.
 *
 * @param {{
 *   user: { id: string; email?: string | null; firstName?: string; lastName?: string; middleName?: string | null };
 *   personalOrgProjectId?: string | null;
 * }} props
 */
export async function StudentDashboardHome({ user, personalOrgProjectId = null }) {
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

  const profile = personalOrgProjectId ? await loadOrgProfile(prisma, personalOrgProjectId) : null;
  const displayName = formatUserDisplayName(user) || "Student";

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title={profile?.title || `Welcome, ${displayName}`}
        description={profile ? `Welcome, ${displayName}.` : "Your organisation and academic work."}
      >
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          {profile?.projectCode ? <span>Code: {profile.projectCode}</span> : null}
          {ayLabel ? <span>Academic Year: {ayLabel}</span> : null}
        </div>
      </DashboardPageIntro>

      {joinNeeded ? (
        <div className={`${BRAND_CARD_CLASS} border-brand-yellow/50 p-4 sm:p-5`} role="status">
          <h2 className={BRAND_SECTION_TITLE_CLASS}>Join the current academic year</h2>
        </div>
      ) : null}

      {profile ? (
        <OrgProfileView
          profile={profile}
          settingsHref="/organisation/org-admin/settings"
          links={orgProfileAdminLinks("/organisation")}
        />
      ) : null}

      <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>My Academic Work</h2>
        <div className="mt-3 flex flex-wrap gap-2">
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
          <Link
            href="/academic/results"
            title="Open Results"
            className="inline-flex cursor-pointer items-center rounded-lg border border-[color:var(--border-subtle)] bg-surface-card px-4 py-2 text-sm font-medium text-foreground"
          >
            Results
          </Link>
        </div>
        {!enrolled && ayLabel ? (
          <p className={`mt-3 text-sm ${BRAND_PAGE_LEAD_CLASS}`}>Not enrolled in {ayLabel}.</p>
        ) : null}
      </section>
    </div>
  );
}
