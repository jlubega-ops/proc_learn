import { AdminProgrammesPanel } from "@/components/admin/admin-programmes-panel";

export const metadata = {
  title: "Programmes",
};

export default function AdminProgrammesPage() {
  return (
    <div className="w-full space-y-4">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Programmes</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Only active programmes appear when staff add students.
      </p>
      <AdminProgrammesPanel />
    </div>
  );
}
