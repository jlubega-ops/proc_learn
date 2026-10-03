import Chip from "@mui/material/Chip";
import Link from "next/link";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import { prisma } from "@/lib/prisma";
import { formatUserDisplayName } from "@/lib/user-display";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
  BRAND_PAGE_LEAD_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { BRAND_BTN_PRIMARY_CLASS, BRAND_CARD_CLASS, BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";
import { OrgDisplayNameForm } from "@/components/projects/org-display-name-form";

export const metadata = {
  title: "Organisation dashboard",
};

/**
 * Organisation unit dashboard (default My Organisation or attempt shell).
 * Project instructions live under /organisation/overview when in an attempt org.
 */
export default async function StudentOrganisationHomePage() {
  const org = await requireStudentOrganisation();
  const ctx = await getProjectWorkspacePageContext(org.projectId, {
    pathname: "/organisation",
  });

  const project = await prisma.project.findUnique({
    where: { id: org.projectId },
    include: {
      owner: {
        select: { firstName: true, middleName: true, lastName: true, email: true },
      },
      sourceAcademicProject: {
        select: {
          id: true,
          name: true,
          purpose: true,
          organizationName: true,
        },
      },
    },
  });
  if (!project) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  const isAttemptOrg = Boolean(project.isAttemptOrg && project.sourceAcademicProject);
  const academic = project.sourceAcademicProject;
  const title = project.organizationName || project.name;
  const purposeLabel =
    academic?.purpose === "ASSESSMENT"
      ? "Assessment"
      : academic?.purpose === "PRACTICE"
        ? "Practice"
        : null;

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title={title}
        description={
          isAttemptOrg
            ? `${purposeLabel || "Project"} workspace.`
            : project.projectCode
              ? `Your organisation · ${project.projectCode}`
              : "Your organisation"
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isAttemptOrg ? (
            <Chip
              size="small"
              color={academic?.purpose === "ASSESSMENT" ? "warning" : "info"}
              label={`${purposeLabel} organisation`}
            />
          ) : (
            <Chip size="small" label="My Organisation" color="primary" />
          )}
          {isAttemptOrg ? (
            <Chip size="small" label={project.status} color="info" />
          ) : null}
          {ctx.user ? (
            <Chip
              size="small"
              label={formatUserDisplayName(ctx.user) || ctx.user.email || "Student"}
              color="default"
            />
          ) : null}
        </div>
      </DashboardPageIntro>

      {isAttemptOrg && academic ? (
        <div className={`${BRAND_CARD_CLASS} border-brand-yellow/40 p-4 sm:p-5`} role="status">
          <h2 className={BRAND_SECTION_TITLE_CLASS}>Working on “{academic.name}”</h2>
          <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
            Open Project overview for instructions, the question, and project details.
          </p>
          <Link
            href="/organisation/overview"
            className={`${BRAND_BTN_PRIMARY_CLASS} mt-4 inline-flex cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold`}
          >
            Project overview
          </Link>
        </div>
      ) : null}

      {!isAttemptOrg && project.isPersonalOrg ? (
        <div className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
          <OrgDisplayNameForm
            organizationName={project.organizationName || project.name}
            defaultName={project.name}
          />
        </div>
      ) : null}

      <div className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Owner</h2>
        <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
          {formatUserDisplayName(project.owner)} ({project.owner?.email || "—"})
        </p>
      </div>
    </div>
  );
}
