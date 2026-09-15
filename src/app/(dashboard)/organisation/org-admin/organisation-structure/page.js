import { prisma } from "@/lib/prisma";
import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import { OrganisationStructurePanel } from "@/components/projects/organisation-structure-panel";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";

export const metadata = { title: "Organisation structure" };

export default async function OrganisationStructurePage() {
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
        title="Organisation structure"
        description={`Arrange departments for ${title} from top to bottom. Create units under Departments, then set parents and order here.`}
      />
      <OrganisationStructurePanel
        projectId={project.id}
        organizationName={project.organizationName || project.name}
        projectName={project.name}
        readOnly={false}
        departmentsHref="/organisation/org-admin/departments"
      />
    </div>
  );
}
