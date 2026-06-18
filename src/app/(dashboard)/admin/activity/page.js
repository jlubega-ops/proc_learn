import { AdminActivityPanel } from "@/components/admin/admin-activity-panel";

export const metadata = {
  title: "Activity logs",
};

export default function AdminActivityPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground sm:text-xl">Activity logs</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Audit trail for security-sensitive actions. Only visible while your active role is system
          admin.
        </p>
      </div>
      <AdminActivityPanel />
    </div>
  );
}
