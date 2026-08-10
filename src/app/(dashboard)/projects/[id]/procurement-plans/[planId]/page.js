import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgProcurementPlanDetailPanel } from "@/components/projects/org-procurement-plan-detail-panel";

export const metadata = { title: "Procurement plan" };

/**
 * @param {{ params: Promise<{ id: string; planId: string }> }} props
 */
export default async function ProjectProcurementPlanDetailPage({ params }) {
  const p = await params;
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Procurement plan"
        description="Preview plan items, submission status, and review decisions through the planning workflow."
      />
      <OrgProcurementPlanDetailPanel
        projectId={String(p?.id || "").trim()}
        planId={String(p?.planId || "").trim()}
      />
    </div>
  );
}
