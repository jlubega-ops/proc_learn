import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import {
  ensureProjectOrgAdminRole,
  isProjectOrgAdminRole,
  PROJECT_ORG_ENTRY_ROLE_NAME,
} from "@/lib/project-org-role";

export default async function ProjectRolesPage({ params }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/projects");
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (activeRole !== Role.STUDENT) notFound();

  const p = await params;
  const id = String(p?.id || "").trim();
  if (!id) notFound();

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  await ensureProjectOrgAdminRole(prisma);

  const roles = await prisma.projectOrgRole.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="w-full space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Roles & Permissions</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          You entered <span className="font-semibold">{project.name}</span> as{" "}
          <span className="font-semibold text-primary">{PROJECT_ORG_ENTRY_ROLE_NAME}</span>. This page is
          view-only — roles are managed by system admin. Use these roles when you assign organisation user
          accounts inside your project.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/60">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-zinc-700 dark:text-zinc-200">Role</th>
              <th className="px-4 py-3 text-left font-semibold text-zinc-700 dark:text-zinc-200">
                Description
              </th>
              <th className="px-4 py-3 text-left font-semibold text-zinc-700 dark:text-zinc-200">Status</th>
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400">
                  No project roles are available yet. Contact your examiner or system admin.
                </td>
              </tr>
            ) : (
              roles.map((role) => (
                <tr
                  key={role.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-zinc-900 dark:text-white">{role.name}</span>
                      {isProjectOrgAdminRole(role.name) ? (
                        <span className="inline-flex rounded-full bg-[#008bd0]/15 px-2 py-0.5 text-xs font-semibold text-[#008bd0]">
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
