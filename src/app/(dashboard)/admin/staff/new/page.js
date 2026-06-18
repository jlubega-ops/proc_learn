import { AdminAddStaffForm } from "@/components/admin/admin-add-staff-form";
import {
  BRAND_PAGE_SHELL_CLASS,
  DashboardPageIntro,
} from "@/components/layout/dashboard-page-intro";

export const metadata = {
  title: "Add staff",
};

export default function AdminAddStaffPage() {
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Add staff user"
        description="Creates an active staff account and emails a temporary password. On first sign-in (email + password or Google), they must choose a personal password."
      />
      <AdminAddStaffForm />
    </div>
  );
}
