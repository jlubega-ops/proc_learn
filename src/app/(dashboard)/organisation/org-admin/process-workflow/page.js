import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import { ProjectOrgProcessWorkflowPanel } from "@/components/projects/project-org-process-workflow-panel";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";

export const metadata = { title: "Process workflow" };

export default async function OrganisationProcessWorkflowPage() {
  const org = await requireStudentOrganisation();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Process workflow"
        description="Processes your organisation runs."
      />
      <ProjectOrgProcessWorkflowPanel projectId={org.projectId} />
    </div>
  );
}
