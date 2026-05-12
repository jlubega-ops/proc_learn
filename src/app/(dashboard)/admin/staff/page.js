import { AdminStaffPanel } from "@/components/admin/admin-staff-panel";

export const metadata = {
  title: "Staff users",
};

export default function AdminStaffPage() {
  return (
    <div className="w-full space-y-4">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Staff users</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        System administrators, lecturers, and examiners (not student accounts). Edit roles, suspend,
        or remove access.
      </p>
      <AdminStaffPanel />
    </div>
  );
}
