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
export default async function ProjectProvidersPage({ params }) {
  const p = await params;
  const projectId = String(p?.id || "").trim();
  const h = await headers();
  const pathname = safeNextPath(h.get("x-pl-pathname") || `/projects/${projectId}/providers`);
  await getProjectWorkspacePageContext(projectId, { pathname });

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Provider register"
        description="Suppliers, contractors, service providers and consultants this organisation can shortlist, invite or select. Eligibility is checked against each provider's simulated registrations and compliance documents."
      />
      <OrgProvidersPanel projectId={projectId} detailBase={`/projects/${projectId}/providers`} />
    </div>
  );
}
