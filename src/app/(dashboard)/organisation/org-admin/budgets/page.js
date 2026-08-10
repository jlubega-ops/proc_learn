import { prisma } from "@/lib/prisma";
import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { ProjectOrgBudgetsPanel } from "@/components/projects/project-org-budgets-panel";

export const metadata = { title: "Budgets" };

export default async function OrganisationBudgetsPage() {
  const org = await requireStudentOrganisation();
  const project = await prisma.project.findUnique({
    where: { id: org.projectId },
    select: { id: true, name: true, organizationName: true },
  });
  if (!project) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Budgets (system view)"
        description={`Organisation Administrator system view for ${project.organizationName || project.name}. Budgets are business records prepared and approved by operational roles (User Department → Head of Department → Finance/Budget Officer → Accounting Officer). Activate the Budgeting Process under Process Workflows; do not create or approve budgets here.`}
      />
      <ProjectOrgBudgetsPanel projectId={project.id} readOnly />
    </div>
  );
}
