import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import { ProjectOrgProcessWorkflowPanel } from "@/components/projects/project-org-process-workflow-panel";

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
    <div className="w-full space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-foreground sm:text-xl">Process workflow</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {canManage ? "Add" : "View"} organisation process workflows for{" "}
          <span className="font-semibold">{project.name}</span>. Choose from processes configured
          by system administrators under Project settings.
        </p>
      </div>
      <ProjectOrgProcessWorkflowPanel projectId={project.id} />
    </div>
  );
}
