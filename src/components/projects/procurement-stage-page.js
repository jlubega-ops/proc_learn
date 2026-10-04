import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgProcurementStageList } from "@/components/projects/org-procurement-stage-list";
import { OrgProcurementDetailPanel } from "@/components/projects/org-procurement-detail-panel";
import { PROCUREMENT_STAGE_PAGES } from "@/lib/projects/procurement-stage-pages";

/**
 * One procurement opened from a section page: full details, that section's actions and history.
 * @param {{ params: Promise<{ id: string; procurementId: string }>; stage: keyof typeof PROCUREMENT_STAGE_PAGES }} props
 */
export async function ProcurementSectionRecordPage({ params, stage }) {
  const p = await params;
  const projectId = String(p?.id || "").trim();
  const procurementId = String(p?.procurementId || "").trim();
  const config = PROCUREMENT_STAGE_PAGES[stage];

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro title={config.label} description={config.description} />
      <OrgProcurementDetailPanel
        projectId={projectId}
        procurementId={procurementId}
        stage={config.stage}
        backHref={`/projects/${projectId}/procurements/${stage}`}
        backLabel={`Back to ${config.label}`}
      />
    </div>
  );
}

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
