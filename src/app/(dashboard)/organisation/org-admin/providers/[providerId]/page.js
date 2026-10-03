import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgProviderDetail } from "@/components/projects/org-provider-detail";

export const metadata = { title: "Provider details" };

/**
 * @param {{ params: Promise<{ providerId: string }> }} props
 */
export default async function OrganisationProviderDetailPage({ params }) {
  const org = await requireStudentOrganisation();
  const p = await params;
  const providerId = String(p?.providerId || "").trim();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Provider details (read-only)"
        description="Registration, compliance documents, eligibility and portal login for this provider."
      />
      <OrgProviderDetail
        projectId={org.projectId}
        providerId={providerId}
        backHref="/organisation/org-admin/providers"
      />
    </div>
  );
}
