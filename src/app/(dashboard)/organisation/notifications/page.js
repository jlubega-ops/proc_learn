import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgNotificationsPanel } from "@/components/projects/org-notifications-panel";

export const metadata = { title: "Notifications" };

export default function OrganisationNotificationsPage() {
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Notifications"
        description="Workflow tasks, returns, approvals, and other organisation alerts."
      />
      <OrgNotificationsPanel />
    </div>
  );
}
