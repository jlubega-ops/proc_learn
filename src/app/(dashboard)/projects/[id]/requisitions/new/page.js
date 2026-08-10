import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgRequisitionCreateForm } from "@/components/projects/org-requisition-create-form";

export const metadata = { title: "New requisition" };

/**
 * @param {{ params: Promise<{ id: string }> }} props
 */
export default async function ProjectRequisitionNewPage({ params }) {
  const p = await params;
  const projectId = String(p?.id || "").trim();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="New requisition"
        description="Create and submit a procurement requisition. You will return to the requisitions list after submit."
      />
      <OrgRequisitionCreateForm projectId={projectId} />
    </div>
  );
}
