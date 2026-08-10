import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgBudgetCreateForm } from "@/components/projects/org-budget-create-form";

export const metadata = { title: "New department budget" };

/**
 * @param {{ params: Promise<{ id: string }> }} props
 */
export default async function ProjectBudgetNewPage({ params }) {
  const p = await params;
  const projectId = String(p?.id || "").trim();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="New department budget"
        description="Prepare a department budget requirement draft. You will return to the budgets list after saving."
      />
      <OrgBudgetCreateForm projectId={projectId} />
    </div>
  );
}
