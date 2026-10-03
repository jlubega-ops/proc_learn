import { headers } from "next/headers";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgProvidersPanel } from "@/components/projects/org-providers-panel";

export const metadata = { title: "Providers" };

/**
 * @param {{ params: Promise<{ id: string }> }} props
 */
export default async function ProjectOrgAdminProvidersPage({ params }) {
  const p = await params;
  const projectId = String(p?.id || "").trim();
  const h = await headers();
  const pathname = safeNextPath(
    h.get("x-pl-pathname") || `/projects/${projectId}/org-admin/providers`,
  );
  await getProjectWorkspacePageContext(projectId, { pathname, requirePlatformOrgAdmin: true });

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Provider register (read-only)"
        description="Organisation Administrator view. The Procurement Officer and Head PDU maintain the register; here you can review providers and their portal logins."
      />
      <OrgProvidersPanel
        projectId={projectId}
        detailBase={`/projects/${projectId}/org-admin/providers`}
      />
    </div>
  );
}
