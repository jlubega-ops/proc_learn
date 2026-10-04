import { notFound } from "next/navigation";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgProcurementDetailPanel } from "@/components/projects/org-procurement-detail-panel";
import { PROCUREMENT_STAGE_KEYS } from "@/lib/projects/procurement-task-stage";

export const metadata = { title: "Procurement task" };

/**
 * @param {{ params: Promise<{ id: string; procurementId: string; stage: string }> }} props
 */
export default async function ProjectProcurementStagePage({ params }) {
  const p = await params;
  const projectId = String(p?.id || "").trim();
  const procurementId = String(p?.procurementId || "").trim();
  const stage = String(p?.stage || "").trim();
  if (!PROCUREMENT_STAGE_KEYS.includes(stage)) notFound();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro title="Procurement task" description="Act on one stage of this procurement." />
      <OrgProcurementDetailPanel projectId={projectId} procurementId={procurementId} stage={stage} />
    </div>
  );
}
