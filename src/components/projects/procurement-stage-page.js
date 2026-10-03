import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgProcurementStageList } from "@/components/projects/org-procurement-stage-list";
import { PROCUREMENT_STAGE_PAGES } from "@/lib/projects/procurement-stage-pages";

/**
 * @param {{ params: Promise<{ id: string }>; stage: keyof typeof PROCUREMENT_STAGE_PAGES }} props
 */
export async function ProcurementStagePage({ params, stage }) {
  const p = await params;
  const projectId = String(p?.id || "").trim();
  const config = PROCUREMENT_STAGE_PAGES[stage];

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro title={config.label} description={config.description} />
      <OrgProcurementStageList projectId={projectId} stage={stage} />
    </div>
  );
}
