import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import { OrganisationStructureChart } from "@/components/projects/organisation-structure-chart";

export default async function ProjectOrganisationStructurePage({ params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  const h = await headers();
  const pathname = safeNextPath(
    h.get("x-pl-pathname") || `/projects/${id}/org-admin/organisation-structure`,
  );
  const ctx = await getProjectWorkspacePageContext(id, {
    pathname,
    requirePlatformOrgAdmin: true,
  });

  const [project, departments] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      select: { id: true, name: true, organizationName: true },
    }),
    prisma.projectOrgDepartment.findMany({
      where: { projectId: id, parentId: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 24,
    }),
  ]);

  if (!project) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  const orgDisplayName =
    String(project.organizationName || "").trim() || project.name;

  return (
    <div className="w-full space-y-4">
      <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] p-4 sm:p-5">
        <h1 className="text-lg font-semibold text-foreground sm:text-xl">
          Organisation structure
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {ctx.readOnly ? "View" : "Manage"} how{" "}
          <span className="font-semibold text-foreground">{orgDisplayName}</span> is arranged for
          procurement learning. The chart below reflects the standard governance model for this
          workspace; departments you create appear under user departments.
        </p>
      </div>

      <OrganisationStructureChart
        organizationName={project.organizationName}
        projectName={project.name}
        departments={departments}
        readOnly={ctx.readOnly}
      />
    </div>
  );
}
