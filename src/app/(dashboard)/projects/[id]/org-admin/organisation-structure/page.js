import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import { OrganisationStructurePanel } from "@/components/projects/organisation-structure-panel";

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

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, organizationName: true },
  });

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
          {ctx.readOnly ? "View" : "Arrange"} how{" "}
          <span className="font-semibold text-foreground">{orgDisplayName}</span> is organised
          from top to bottom. Create units under Departments, then set parents and order here.
        </p>
      </div>

      <OrganisationStructurePanel
        projectId={project.id}
        organizationName={project.organizationName}
        projectName={project.name}
        readOnly={ctx.readOnly}
        departmentsHref={`/projects/${project.id}/org-admin/departments`}
      />
    </div>
  );
}
