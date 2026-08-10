import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgBudgetDetailPanel } from "@/components/projects/org-budget-detail-panel";

export const metadata = { title: "Budget detail" };

/**
 * @param {{ params: Promise<{ id: string; budgetId: string }> }} props
 */
export default async function ProjectBudgetDetailPage({ params }) {
  const p = await params;
  const projectId = String(p?.id || "").trim();
  const budgetId = String(p?.budgetId || "").trim();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Budget"
        description="Preview department budget details, submission status, and review decisions."
      />
      <OrgBudgetDetailPanel projectId={projectId} budgetId={budgetId} />
    </div>
  );
}
