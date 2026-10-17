import {
  BRAND_PAGE_SHELL_CLASS,
  DashboardPageIntro,
} from "@/components/layout/dashboard-page-intro";
import { ProjectProcessFlowsPanel } from "@/components/projects/project-org-process-flows-panel";
import { NAV_LABELS } from "@/lib/nav-labels";

export const metadata = {
  title: NAV_LABELS.processFlow,
};

export default function ProjectProcessFlowSettingsPage() {
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title={NAV_LABELS.processFlow}
        description="Processes used in organisation workspaces."
      />
      <ProjectProcessFlowsPanel apiBase="/api/project-process-flows" />
    </div>
  );
}
