import { prisma } from "@/lib/prisma";
import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import { ProjectOrgProcessWorkflowPanel } from "@/components/projects/project-org-process-workflow-panel";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";

export const metadata = { title: "Process workflow" };

export default async function OrganisationProcessWorkflowPage() {
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
        title="Process workflow"
        description={`Add organisation process workflows for ${title}. Choose from processes configured by system administrators under Project settings.`}
      />
      <ProjectOrgProcessWorkflowPanel projectId={project.id} />
    </div>
  );
}
