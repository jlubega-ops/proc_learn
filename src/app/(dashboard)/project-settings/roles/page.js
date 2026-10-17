import { AdminProjectOrgRolesPanel } from "@/components/admin/admin-project-org-roles-panel";
import {
  BRAND_PAGE_SHELL_CLASS,
  DashboardPageIntro,
} from "@/components/layout/dashboard-page-intro";
import { NAV_LABELS } from "@/lib/nav-labels";

export const metadata = {
  title: NAV_LABELS.procurementRoles,
};

export default function ProjectOrgRolesPage() {
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title={NAV_LABELS.procurementRoles}
        description="Roles used in organisation workspaces."
      />
      <AdminProjectOrgRolesPanel />
    </div>
  );
}
