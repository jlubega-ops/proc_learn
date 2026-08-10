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

  const title = project.organizationName || project.name;
  const codeHint = project.projectCode ? ` (unit code ${project.projectCode})` : "";

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="User accounts"
        description={`Manage organisation user accounts for ${title}${codeHint}.`}
      />
      <ProjectOrgUsersPanel projectId={project.id} />
    </div>
  );
}
