import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgSuppliersPanel } from "@/components/projects/org-suppliers-panel";

export const metadata = { title: "Suppliers" };

/**
 * @param {{ params: Promise<{ id: string }> }} props
 */
export default async function ProjectSuppliersPage({ params }) {
  const p = await params;
  const projectId = String(p?.id || "").trim();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Suppliers"
        description="Reusable supplier/provider records for micro purchase instructions, quotations, and tenders."
      />
      <OrgSuppliersPanel projectId={projectId} />
    </div>
  );
}
