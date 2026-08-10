import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { ProjectOrgAuditLogsPanel } from "@/components/projects/project-org-audit-logs-panel";

export const metadata = { title: "Activity logs" };

/**
 * @param {{ params: Promise<{ id: string }> }} props
 */
export default async function ProjectOrgAuditLogsPage({ params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  const h = await headers();
  const pathname = safeNextPath(h.get("x-pl-pathname") || `/projects/${id}/org-admin/audit-logs`);
  await getProjectWorkspacePageContext(id, {
    pathname,
    requirePlatformOrgAdmin: true,
  });

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, organizationName: true },
  });
  if (!project) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Organisation activity logs"
        description={`Security and business actions for ${project.organizationName || project.name}.`}
      />
      <ProjectOrgAuditLogsPanel projectId={project.id} />
    </div>
  );
}
