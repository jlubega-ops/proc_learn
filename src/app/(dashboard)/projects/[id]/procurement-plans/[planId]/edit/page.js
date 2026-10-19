import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgProcurementPlanCreateForm } from "@/components/projects/org-procurement-plan-create-form";

export const metadata = { title: "Edit procurement plan" };

/**
 * @param {{ params: Promise<{ id: string; planId: string }> }} props
 */
export default async function ProjectProcurementPlanEditPage({ params }) {
  const p = await params;
  const projectId = String(p?.id || "").trim();
  const planId = String(p?.planId || "").trim();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Edit procurement plan"
        description="Update while draft, returned, or still awaiting Head of User Department review."
      />
      <OrgProcurementPlanCreateForm projectId={projectId} planId={planId} />
    </div>
  );
}
