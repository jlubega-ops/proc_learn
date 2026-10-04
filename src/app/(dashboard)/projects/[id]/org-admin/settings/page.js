import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { NAV_LABELS } from "@/lib/nav-labels";
import { loadOrgSettings } from "@/lib/projects/org-settings";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import { OrgSettingsPanel } from "@/components/projects/org-settings-panel";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";

export const metadata = { title: NAV_LABELS.settings };

export default async function ProjectOrgSettingsPage({ params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  const h = await headers();
  const pathname = safeNextPath(h.get("x-pl-pathname") || `/projects/${id}/org-admin/settings`);
  const ctx = await getProjectWorkspacePageContext(id, {
    pathname,
    requirePlatformOrgAdmin: true,
  });

  const settings = await loadOrgSettings(prisma, id);
  if (!settings) notFound();

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro title={NAV_LABELS.settings} description="Organisation name and vote number." />
      <OrgSettingsPanel projectId={id} initialSettings={settings} readOnly={ctx.readOnly} />
    </div>
  );
}
