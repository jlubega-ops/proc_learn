import { AdminAcademicSetupPanel } from "@/components/admin/admin-academic-setup-panel";

export const metadata = {
  title: "Academic setup",
};

export default function AdminAcademicSetupPage() {
  return (
    <div className="w-full space-y-4">
      <h1 className="text-lg font-semibold text-foreground sm:text-xl">Academic setup</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        University academic years and courses.
      </p>
      <AdminAcademicSetupPanel />
    </div>
  );
}
