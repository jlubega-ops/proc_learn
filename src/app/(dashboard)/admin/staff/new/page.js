import { AdminAddStaffForm } from "@/components/admin/admin-add-staff-form";

export const metadata = {
  title: "Add staff",
};

export default function AdminAddStaffPage() {
  return (
    <div className="w-full space-y-4">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Add staff user</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Creates a pending account and sends a 7-day activation link to set a password.
      </p>
      <AdminAddStaffForm />
    </div>
  );
}
