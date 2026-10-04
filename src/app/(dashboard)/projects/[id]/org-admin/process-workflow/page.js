import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import { ProjectOrgProcessWorkflowPanel } from "@/components/projects/project-org-process-workflow-panel";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";

export default async function ProjectProcessWorkflowPage({ params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  const h = await headers();
  const pathname = safeNextPath(
    h.get("x-pl-pathname") || `/projects/${id}/org-admin/process-workflow`,
  );
  const ctx = await getProjectWorkspacePageContext(id, { pathname });

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!project) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  const canManage = ctx.viewer === "platform" && !ctx.readOnly;

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Process Workflows"
        description={canManage ? "Processes your organisation runs." : `Processes ${project.name} runs.`}
      />
      <ProjectOrgProcessWorkflowPanel projectId={project.id} />
    </div>
  );
}
