import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgProcurementPlansPanel } from "@/components/projects/org-procurement-plans-panel";

export const metadata = { title: "Procurement Plans" };

export default async function ProjectProcurementPlansPage({ params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Procurement Plans"
        description="Approved and draft procurement plans available to your role."
      />
      <OrgProcurementPlansPanel projectId={id} />
    </div>
  );
}
