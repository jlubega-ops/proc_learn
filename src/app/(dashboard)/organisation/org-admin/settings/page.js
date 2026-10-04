import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { NAV_LABELS } from "@/lib/nav-labels";
import { loadOrgSettings } from "@/lib/projects/org-settings";
import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import { OrgSettingsPanel } from "@/components/projects/org-settings-panel";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";

export const metadata = { title: NAV_LABELS.settings };

export default async function OrganisationSettingsPage() {
  const org = await requireStudentOrganisation();
  const settings = await loadOrgSettings(prisma, org.projectId);
  if (!settings) notFound();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro title={NAV_LABELS.settings} description="Organisation name and vote number." />
      <OrgSettingsPanel projectId={org.projectId} initialSettings={settings} />
    </div>
  );
}
