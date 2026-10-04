import { OrgRequisitionsPanel } from "@/components/projects/org-requisitions-panel";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";

export const metadata = { title: "Requisitions" };

export default async function ProjectRequisitionsPage({ params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Requisitions"
        description="Create and track procurement requisitions for your organisation role."
      />
      <OrgRequisitionsPanel projectId={id} />
    </div>
  );
}
