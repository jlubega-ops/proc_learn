import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgProcurementDetailPanel } from "@/components/projects/org-procurement-detail-panel";

export const metadata = { title: "Procurement detail" };

/**
 * @param {{ params: Promise<{ id: string; procurementId: string }> }} props
 */
export default async function ProjectProcurementDetailPage({ params }) {
  const p = await params;
  const projectId = String(p?.id || "").trim();
  const procurementId = String(p?.procurementId || "").trim();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Procurement"
        description="Full record and progress of this procurement."
      />
      <OrgProcurementDetailPanel projectId={projectId} procurementId={procurementId} />
    </div>
  );
}
