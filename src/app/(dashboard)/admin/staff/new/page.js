import { AdminAddStaffForm } from "@/components/admin/admin-add-staff-form";

export const metadata = {
  title: "Add staff",
};

export default function AdminAddStaffPage() {
  return (
    <div className="w-full space-y-4">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Add staff user</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Creates an active staff account and emails a temporary password. On first sign-in (email +
        password or Google), they must choose a personal password.
      </p>
      <AdminAddStaffForm />
    </div>
  );
}
