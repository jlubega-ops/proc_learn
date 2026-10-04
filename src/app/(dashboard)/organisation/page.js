import Chip from "@mui/material/Chip";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import { loadOrgProfile } from "@/lib/projects/org-profile";
import { prisma } from "@/lib/prisma";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgProfileView, orgProfileAdminLinks } from "@/components/projects/org-profile-view";
import { BRAND_BTN_PRIMARY_CLASS, BRAND_CARD_CLASS, BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";
import { NAV_LABELS } from "@/lib/nav-labels";

export const metadata = {
  title: NAV_LABELS.dashboard,
};

/**
 * Practice / Assessment organisation dashboard. The personal organisation lives on `/`.
 */
export default async function StudentOrganisationHomePage() {
  const org = await requireStudentOrganisation();
  await getProjectWorkspacePageContext(org.projectId, { pathname: "/organisation" });

  const project = await prisma.project.findUnique({
    where: { id: org.projectId },
    select: {
      isAttemptOrg: true,
      status: true,
      sourceAcademicProject: { select: { name: true, purpose: true } },
    },
  });
  if (!project) notFound();

  const academic = project.isAttemptOrg ? project.sourceAcademicProject : null;
  if (!academic) redirect("/");

  const profile = await loadOrgProfile(prisma, org.projectId);
  if (!profile) notFound();

  const isAssessment = academic.purpose === "ASSESSMENT";

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro hero title={profile.title} description={`${profile.typeLabel}.`}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip size="small" color={isAssessment ? "warning" : "info"} label={profile.typeLabel} />
          <Chip size="small" color="info" label={project.status} />
          {profile.projectCode ? <Chip size="small" color="primary" label={profile.projectCode} /> : null}
        </div>
      </DashboardPageIntro>

      <div
        className={`${BRAND_CARD_CLASS} flex flex-col gap-3 border-brand-yellow/40 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5`}
        role="status"
      >
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Working on “{academic.name}”</h2>
        <Link
          href="/organisation/overview"
          className={`${BRAND_BTN_PRIMARY_CLASS} inline-flex w-full cursor-pointer justify-center rounded-lg px-4 py-2 text-sm font-semibold sm:w-auto`}
        >
          Project overview
        </Link>
      </div>

      <OrgProfileView
        profile={profile}
        settingsHref="/organisation/org-admin/settings"
        links={orgProfileAdminLinks("/organisation")}
      />
    </div>
  );
}
