import { AdminAcademicSetupPanel } from "@/components/admin/admin-academic-setup-panel";

export const metadata = {
  title: "Academic setup",
};

export default function AdminAcademicSetupPage() {
  return (
    <div className="w-full space-y-4">
      <h1 className="text-lg font-semibold text-foreground sm:text-xl">Academic setup</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Manage university academic years and courses. This is separate from organisation financial
        years used in the procurement simulation.
      </p>
      <AdminAcademicSetupPanel />
    </div>
  );
}
