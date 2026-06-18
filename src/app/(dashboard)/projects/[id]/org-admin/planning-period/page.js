import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import { ProjectOrgPlanningPeriodsPanel } from "@/components/projects/project-org-planning-periods-panel";

export default async function ProjectPlanningPeriodPage({ params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  const h = await headers();
  const pathname = safeNextPath(h.get("x-pl-pathname") || `/projects/${id}/org-admin/planning-period`);
  const ctx = await getProjectWorkspacePageContext(id, {
    pathname,
    requirePlatformOrgAdmin: true,
  });

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!project) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  return (
    <div className="w-full space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-foreground sm:text-xl">Planning period</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {ctx.readOnly ? "View" : "Manage"} planning periods for{" "}
          <span className="font-semibold">{project.name}</span> in this isolated organisation.
        </p>
      </div>
      <ProjectOrgPlanningPeriodsPanel projectId={project.id} readOnly={ctx.readOnly} />
    </div>
  );
}
