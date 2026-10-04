import { headers } from "next/headers";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import { NAV_LABELS } from "@/lib/nav-labels";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgDepartmentBudgetsPanel } from "@/components/projects/org-department-budgets-panel";

export const metadata = { title: NAV_LABELS.budgets };

/**
 * @param {{ params: Promise<{ id: string }> }} props
 */
export default async function ProjectOrgAdminBudgetsPage({ params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  const h = await headers();
  const pathname = safeNextPath(h.get("x-pl-pathname") || `/projects/${id}/org-admin/budgets`);
  await getProjectWorkspacePageContext(id, { pathname, requirePlatformOrgAdmin: true });

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro title={NAV_LABELS.budgets} description="Department budgets." />
      <OrgDepartmentBudgetsPanel
        projectId={id}
        readOnly
        detailHrefBase={`/projects/${id}/org-admin/budgets`}
      />
    </div>
  );
}
