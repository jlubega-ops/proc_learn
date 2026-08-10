import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgDepartmentBudgetsPanel } from "@/components/projects/org-department-budgets-panel";

export const metadata = { title: "Department Budgets" };

export default async function ProjectBudgetsPage({ params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Department Budgets"
        description="Prepare, review, and track department budget requirements. Only APPROVED budgets unlock procurement planning and requisitions."
      />
      <OrgDepartmentBudgetsPanel projectId={id} />
    </div>
  );
}
