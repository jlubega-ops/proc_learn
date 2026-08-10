import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgProcurementPlanCreateForm } from "@/components/projects/org-procurement-plan-create-form";

export const metadata = { title: "New procurement plan" };

/**
 * @param {{ params: Promise<{ id: string }> }} props
 */
export default async function ProjectProcurementPlanNewPage({ params }) {
  const p = await params;
  const projectId = String(p?.id || "").trim();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="New procurement plan"
        description="Prepare a department procurement plan draft. You will return to the plans list after saving."
      />
      <OrgProcurementPlanCreateForm projectId={projectId} />
    </div>
  );
}
