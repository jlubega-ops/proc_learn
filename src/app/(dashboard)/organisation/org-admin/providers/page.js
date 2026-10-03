import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { OrgProvidersPanel } from "@/components/projects/org-providers-panel";

export const metadata = { title: "Providers" };

export default async function OrganisationProvidersPage() {
  const org = await requireStudentOrganisation();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Provider register (read-only)"
        description="Organisation Administrator view. The Procurement Officer and Head PDU maintain the register; here you can review providers and their portal logins."
      />
      <OrgProvidersPanel
        projectId={org.projectId}
        detailBase="/organisation/org-admin/providers"
      />
    </div>
  );
}
