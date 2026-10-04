import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import { formatUserDisplayName } from "@/lib/user-display";
import { orgUserPermissions } from "@/lib/projects/org-role-permissions";

export default async function ProjectOrgMemberAccountPage({ params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  const ctx = await getProjectWorkspacePageContext(id);

  if (ctx.viewer !== "org") {
    const { redirect } = await import("next/navigation");
    redirect(`/projects/${id}`);
  }

  const { orgUser } = ctx;
  const username = orgUser.email;
  const displayName = formatUserDisplayName(orgUser);
  const permissions = orgUserPermissions(orgUser.projectOrgRole?.name);

  return (
    <div className="w-full space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-foreground sm:text-xl">My account</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          You are signed in to{" "}
          <span className="font-semibold">
            {orgUser.project?.organizationName || orgUser.project?.name || "this project"}
          </span>{" "}
          as an organisation user. Use the menu to open pages your role allows.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-zinc-500 dark:text-zinc-400">Name</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-white">{displayName || "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500 dark:text-zinc-400">Login email</dt>
            <dd className="mt-0.5 break-all font-mono text-zinc-900 dark:text-white">
              {username || "—"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500 dark:text-zinc-400">Role</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-white">
              {orgUser.projectOrgRole?.name || "—"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500 dark:text-zinc-400">Department</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-white">
              {orgUser.department?.name || "—"}
              {orgUser.subunit?.name ? ` · ${orgUser.subunit.name}` : ""}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">What you can access</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          {permissions.map((perm) => (
            <li key={perm}>{perm.replace(/^view_/, "View ").replace(/_/g, " ")}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
