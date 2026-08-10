import { prisma } from "@/lib/prisma";
import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import { ProjectOrgFinancialYearsPanel } from "@/components/projects/project-org-financial-years-panel";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";

export const metadata = { title: "Financial years" };

export default async function OrganisationFinancialYearsPage() {
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
        title="Financial years"
        description={`Manage financial years for ${title} in this organisation.`}
      />
      <ProjectOrgFinancialYearsPanel projectId={project.id} />
    </div>
  );
}
