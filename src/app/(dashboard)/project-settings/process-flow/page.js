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
        description="Predefined processes used by all project workspaces."
      />
      <ProjectProcessFlowsPanel apiBase="/api/project-process-flows" />
    </div>
  );
}
