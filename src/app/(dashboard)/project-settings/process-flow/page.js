import {
  BRAND_PAGE_SHELL_CLASS,
  DashboardPageIntro,
} from "@/components/layout/dashboard-page-intro";
import { ProjectProcessFlowsPanel } from "@/components/projects/project-org-process-flows-panel";

export const metadata = {
  title: "Process flow",
};

export default function ProjectProcessFlowSettingsPage() {
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Process flow"
        description="Define organisation process flows and ordered steps for all student project workspaces. Only system administrators can create or edit processes."
      />
      <ProjectProcessFlowsPanel apiBase="/api/project-process-flows" />
    </div>
  );
}
