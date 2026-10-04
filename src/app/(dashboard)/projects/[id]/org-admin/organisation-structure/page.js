import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import { OrganisationStructurePanel } from "@/components/projects/organisation-structure-panel";
import { DashboardPageIntro } from "@/components/layout/dashboard-page-intro";

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

  return (
    <div className="w-full space-y-4">
      <DashboardPageIntro
        title="Organisation Structure"
        description="Order departments and nest subunits."
      />

      <OrganisationStructurePanel
        projectId={project.id}
        readOnly={ctx.readOnly}
        departmentsHref={`/projects/${project.id}/org-admin/departments`}
      />
    </div>
  );
}
