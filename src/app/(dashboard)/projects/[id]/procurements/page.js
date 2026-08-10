import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgProcurementsPanel } from "@/components/projects/org-procurements-panel";

export const metadata = { title: "Procurements" };

/**
 * @param {{ params: Promise<{ id: string }> }} props
 */
export default async function ProjectProcurementsPage({ params }) {
  const p = await params;
  const projectId = String(p?.id || "").trim();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Procurements"
        description="Procurements created after requisition approval and method selection. Each record starts a method-specific workflow."
      />
      <OrgProcurementsPanel projectId={projectId} />
    </div>
  );
}
