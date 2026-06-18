import { AdminStaffPanel } from "@/components/admin/admin-staff-panel";
import {
  BRAND_PAGE_SHELL_CLASS,
  DashboardPageIntro,
} from "@/components/layout/dashboard-page-intro";

export const metadata = {
  title: "Staff users",
};

export default function AdminStaffPage() {
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Staff users"
        description="System administrators, lecturers, and examiners (not student accounts). Add users, edit roles, suspend, or remove access."
      />
      <AdminStaffPanel />
    </div>
  );
}
