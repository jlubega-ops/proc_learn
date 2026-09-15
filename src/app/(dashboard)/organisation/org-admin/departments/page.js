import { prisma } from "@/lib/prisma";
import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import { ProjectOrgDepartmentsPanel } from "@/components/projects/project-org-departments-panel";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";

export const metadata = { title: "Departments / units" };

export default async function OrganisationDepartmentsPage() {
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
        title="Departments / units"
        description={`Create and rename departments and subunits for ${title}. Arrange top-to-bottom hierarchy on Organisation structure.`}
      />
      <ProjectOrgDepartmentsPanel projectId={project.id} />
    </div>
  );
}
