import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgBudgetDetailPanel } from "@/components/projects/org-budget-detail-panel";

export const metadata = { title: "Budget" };

/**
 * @param {{ params: Promise<{ budgetId: string }> }} props
 */
export default async function OrganisationBudgetDetailPage({ params }) {
  const org = await requireStudentOrganisation();
  const p = await params;
  const budgetId = String(p?.budgetId || "").trim();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro title="Budget" description="Department budget details." />
      <OrgBudgetDetailPanel
        projectId={org.projectId}
        budgetId={budgetId}
        listHref="/organisation/org-admin/budgets"
        readOnly
      />
    </div>
  );
}
