import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgRequisitionDetailPanel } from "@/components/projects/org-requisition-detail-panel";

export const metadata = { title: "Requisition" };

/**
 * @param {{ params: Promise<{ id: string; requisitionId: string }> }} props
 */
export default async function ProjectRequisitionDetailPage({ params }) {
  const p = await params;
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Requisition"
        description="Preview requisition details, plan/budget linkage, and review decisions."
      />
      <OrgRequisitionDetailPanel
        projectId={String(p?.id || "").trim()}
        requisitionId={String(p?.requisitionId || "").trim()}
      />
    </div>
  );
}
