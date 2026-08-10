import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgTasksPanel } from "@/components/projects/org-tasks-panel";

export const metadata = { title: "My Tasks" };

export default async function ProjectTasksPage({ params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="My Tasks"
        description="Pending workflow tasks assigned to your organisation role. Open a record to review evidence and approve, return, or reject."
      />
      <OrgTasksPanel projectId={id} />
    </div>
  );
}
