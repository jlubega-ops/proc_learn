import { redirect } from "next/navigation";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgProcurementProcessesPanel } from "@/components/projects/org-procurement-processes-panel";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";

export const metadata = { title: "Procurement Processes" };

export default async function ProjectProcurementProcessesPage({ params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  const ctx = await getProjectWorkspacePageContext(id, {
    pathname: `/projects/${id}/procurement-processes`,
  });
  if (ctx.viewer === "org") {
    const role = ctx.orgUser?.projectOrgRole?.name || "";
    if (role !== "Procurement Officer") {
      redirect(`/projects/${id}`);
    }
  }

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Procurement Processes"
        description="Methods selected on approved requisitions. Downstream MICRO / QUOTATION / TENDER workflows are queued here and start in a later phase."
      />
      <OrgProcurementProcessesPanel projectId={id} />
    </div>
  );
}
