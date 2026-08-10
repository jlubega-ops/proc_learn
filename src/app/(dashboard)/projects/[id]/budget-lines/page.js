import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgBudgetLinesPanel } from "@/components/projects/org-budget-lines-panel";

export const metadata = { title: "Budgets" };

export default async function ProjectBudgetLinesPage({ params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Budgets"
        description="Budget lines used for funding verification during requisitions."
      />
      <OrgBudgetLinesPanel projectId={id} />
    </div>
  );
}
