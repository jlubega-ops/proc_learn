import { prisma } from "@/lib/prisma";
import {
  ensureProjectOrgAdminRole,
  isProjectOrgAdminRole,
  PROJECT_ORG_ENTRY_ROLE_NAME,
} from "@/lib/project-org-role";
import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { BRAND_CARD_CLASS } from "@/lib/brand-ui";

export const metadata = { title: "Roles & Permissions" };

export default async function OrganisationRolesPage() {
  const org = await requireStudentOrganisation();
  const project = await prisma.project.findUnique({
    where: { id: org.projectId },
    select: { id: true, name: true, organizationName: true },
  });
  if (!project) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  await ensureProjectOrgAdminRole(prisma);
  const roles = await prisma.projectOrgRole.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const title = project.organizationName || project.name;

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Roles & Permissions"
        description={`You entered ${title} as ${PROJECT_ORG_ENTRY_ROLE_NAME}. This page is view-only — roles are managed by system admin under Project settings.`}
      />

      <div className={`overflow-x-auto ${BRAND_CARD_CLASS}`}>
        <table className="min-w-full text-sm">
          <thead className="border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-zinc-700 dark:text-zinc-200">
                Role
              </th>
              <th className="px-4 py-3 text-left font-semibold text-zinc-700 dark:text-zinc-200">
                Description
              </th>
              <th className="px-4 py-3 text-left font-semibold text-zinc-700 dark:text-zinc-200">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400"
                >
                  No organisation roles are available yet. Contact your system admin.
                </td>
              </tr>
            ) : (
              roles.map((role) => (
                <tr
                  key={role.id}
                  className="border-b border-[color:var(--border-subtle)] last:border-0"
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{role.name}</span>
                      {isProjectOrgAdminRole(role.name) ? (
                        <span className="inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                          Your entry role
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {role.description || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        role.isActive
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                      }`}
                    >
                      {role.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
