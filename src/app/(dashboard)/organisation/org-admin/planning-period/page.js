import { prisma } from "@/lib/prisma";
import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import { ProjectOrgPlanningPeriodsPanel } from "@/components/projects/project-org-planning-periods-panel";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";

export const metadata = { title: "Planning period" };

export default async function OrganisationPlanningPeriodPage() {
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
        title="Planning Periods"
        description={`Manage planning periods for ${title} in this organisation.`}
      />
      <ProjectOrgPlanningPeriodsPanel projectId={project.id} />
    </div>
  );
}
