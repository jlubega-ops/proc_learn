import { prisma } from "@/lib/prisma";
import { ensureProjectCode } from "@/lib/projects/project-identity";
import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import { ProjectOrgUsersPanel } from "@/components/projects/project-org-users-panel";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";

export const metadata = { title: "User accounts" };

export default async function OrganisationUsersPage() {
  const org = await requireStudentOrganisation();
  await ensureProjectCode(prisma, org.projectId);
  const project = await prisma.project.findUnique({
    where: { id: org.projectId },
    select: { id: true, name: true, organizationName: true, projectCode: true },
  });
  if (!project) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro title="User accounts" description="People who work in your organisation." />
      <ProjectOrgUsersPanel projectId={project.id} />
    </div>
  );
}
