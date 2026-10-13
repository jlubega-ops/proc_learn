import { headers } from "next/headers";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgBudgetDetailPanel } from "@/components/projects/org-budget-detail-panel";

export const metadata = { title: "Budget" };

/**
 * @param {{ params: Promise<{ id: string; budgetId: string }> }} props
 */
export default async function ProjectOrgAdminBudgetDetailPage({ params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  const budgetId = String(p?.budgetId || "").trim();
  const h = await headers();
  const pathname = safeNextPath(
    h.get("x-pl-pathname") || `/projects/${id}/org-admin/budgets/${budgetId}`
  );
  await getProjectWorkspacePageContext(id, { pathname, requirePlatformOrgAdmin: true });

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro title="Budget" description="Department budget details." />
      <OrgBudgetDetailPanel
        projectId={id}
        budgetId={budgetId}
        listHref={`/projects/${id}/org-admin/budgets`}
        readOnly
      />
    </div>
  );
}
