import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgBudgetCreateForm } from "@/components/projects/org-budget-create-form";

export const metadata = { title: "Edit department budget" };

/**
 * @param {{ params: Promise<{ id: string; budgetId: string }> }} props
 */
export default async function ProjectBudgetEditPage({ params }) {
  const p = await params;
  const projectId = String(p?.id || "").trim();
  const budgetId = String(p?.budgetId || "").trim();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Edit department budget"
        description="Update while draft, returned, or still awaiting Head of User Department review."
      />
      <OrgBudgetCreateForm projectId={projectId} budgetId={budgetId} />
    </div>
  );
}
