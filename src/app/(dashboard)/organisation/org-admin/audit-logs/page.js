import { prisma } from "@/lib/prisma";
import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { ProjectOrgAuditLogsPanel } from "@/components/projects/project-org-audit-logs-panel";

export const metadata = { title: "Activity Logs" };

export default async function OrganisationAuditLogsPage() {
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
        title="Activity Logs"
        description={`Security and business actions for ${project.organizationName || project.name}.`}
      />
      <ProjectOrgAuditLogsPanel projectId={project.id} />
    </div>
  );
}
