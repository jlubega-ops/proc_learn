import { Role } from "@prisma/client";
import Chip from "@mui/material/Chip";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import { prisma } from "@/lib/prisma";
import { formatUserDisplayName } from "@/lib/user-display";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
  BRAND_PAGE_LEAD_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { BRAND_CARD_CLASS, BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";

export const metadata = {
  title: "Organisation",
};

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
    },
  });
  if (!project) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  const title = project.organizationName || project.name;

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title={title}
        description={
          project.projectCode
            ? `You are signed in as Admin for this organisation unit. Unit code: ${project.projectCode}`
            : "You are signed in as Admin for this organisation unit."
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip size="small" label="Organisation" color="primary" />
          <Chip size="small" label={project.status} color="info" />
          {ctx.user ? (
            <Chip
              size="small"
              label={formatUserDisplayName(ctx.user) || ctx.user.email || "Student"}
              color="default"
            />
          ) : null}
        </div>
      </DashboardPageIntro>

      <div className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>About</h2>
        <p className={`mt-2 whitespace-pre-wrap ${BRAND_PAGE_LEAD_CLASS}`}>
          {project.description ||
            "This is your organisation workspace. Use My Organisation → System Administration in the sidebar to manage structure, users, and settings."}
        </p>
      </div>

      <div className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Owner</h2>
        <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
          {formatUserDisplayName(project.owner)} ({project.owner?.email || "—"})
        </p>
        {ctx.activeRole === Role.STUDENT ? (
          <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
            Use <span className="font-semibold text-primary">My Organisation → System Administration</span> to
            configure departments, users, financial years, planning periods, and process workflows
            for your organisation.
          </p>
        ) : null}
      </div>
    </div>
  );
}
