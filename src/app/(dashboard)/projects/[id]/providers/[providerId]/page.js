import { headers } from "next/headers";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgProviderDetail } from "@/components/projects/org-provider-detail";

export const metadata = { title: "Provider details" };

/**
 * @param {{ params: Promise<{ id: string; providerId: string }> }} props
 */
export default async function ProjectProviderDetailPage({ params }) {
  const p = await params;
  const projectId = String(p?.id || "").trim();
  const providerId = String(p?.providerId || "").trim();
  const h = await headers();
  const pathname = safeNextPath(
    h.get("x-pl-pathname") || `/projects/${projectId}/providers/${providerId}`,
  );
  await getProjectWorkspacePageContext(projectId, { pathname });

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Provider details"
        description="Registration, compliance documents, eligibility and portal login for this provider."
      />
      <OrgProviderDetail
        projectId={projectId}
        providerId={providerId}
        backHref={`/projects/${projectId}/providers`}
      />
    </div>
  );
}
