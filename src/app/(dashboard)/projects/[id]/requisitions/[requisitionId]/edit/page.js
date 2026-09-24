import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgRequisitionCreateForm } from "@/components/projects/org-requisition-create-form";

export const metadata = { title: "Edit requisition" };

/**
 * @param {{ params: Promise<{ id: string; requisitionId: string }> }} props
 */
export default async function ProjectRequisitionEditPage({ params }) {
  const p = await params;
  const projectId = String(p?.id || "").trim();
  const requisitionId = String(p?.requisitionId || "").trim();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Edit requisition"
        description="Update this requisition while it is still a draft, returned, or awaiting Head of User Department review."
      />
      <OrgRequisitionCreateForm projectId={projectId} requisitionId={requisitionId} />
    </div>
  );
}
