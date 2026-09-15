import { prisma } from "@/lib/prisma";
import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { ProjectOrgCommitteesPanel } from "@/components/projects/project-org-committees-panel";

export const metadata = { title: "Committees" };

export default async function OrganisationCommitteesPage() {
  const org = await requireStudentOrganisation();
  const project = await prisma.project.findUnique({
    where: { id: org.projectId },
    select: { id: true, name: true, organizationName: true },
  });
  if (!project) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  const title = project.organizationName || project.name;

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Committees"
        description={`Assign existing organisation users for ${title} to committee seats (chair, member, secretary). One person keeps their org role and can switch into a seat when needed — do not create separate committee-only logins.`}
      />
      <ProjectOrgCommitteesPanel projectId={project.id} />
    </div>
  );
}
