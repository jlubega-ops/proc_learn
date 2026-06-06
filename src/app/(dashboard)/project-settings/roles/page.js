import { AdminProjectOrgRolesPanel } from "@/components/admin/admin-project-org-roles-panel";

export const metadata = {
  title: "Project roles",
};

export default function ProjectOrgRolesPage() {
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Project roles</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Organisation roles available when students work inside their project workspace. The{" "}
          <strong>Admin</strong> role is required — students always enter a project as Admin. System admin can
          create, edit, and delete other roles; examiners can review the list.
        </p>
      </div>
      <AdminProjectOrgRolesPanel />
    </div>
  );
}
