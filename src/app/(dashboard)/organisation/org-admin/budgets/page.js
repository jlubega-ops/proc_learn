import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import { NAV_LABELS } from "@/lib/nav-labels";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgDepartmentBudgetsPanel } from "@/components/projects/org-department-budgets-panel";

export const metadata = { title: NAV_LABELS.budgets };

export default async function OrganisationBudgetsPage() {
  const org = await requireStudentOrganisation();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro title={NAV_LABELS.budgets} description="Department budgets." />
      <OrgDepartmentBudgetsPanel
        projectId={org.projectId}
        readOnly
        detailHrefBase="/organisation/org-admin/budgets"
      />
    </div>
  );
}
