import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canManageStudents } from "@/lib/api/student-scope";
import { AdminStudentsPanel } from "@/components/admin/admin-students-panel";
import {
  BRAND_PAGE_LEAD_CLASS,
  BRAND_PAGE_SHELL_CLASS,
  DashboardPageIntro,
} from "@/components/layout/dashboard-page-intro";

export const metadata = {
  title: "Students",
};

export default async function StudentsManagePage() {
  const user = await getSessionUser();
  const r = sessionActiveRole(user);
  if (!user) {
    redirect("/login?next=/students/manage");
  }
  if (!canManageStudents(r)) {
    redirect("/");
  }

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro title="Students">
        <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
          Search and filter by programme or academic year. Changes are logged and system administrators
          are notified.
          {r === Role.EXAMINER ? (
            <>
              {" "}
              As an examiner you can add and maintain student records, suspend or reactivate accounts,
              and open <span className="font-semibold text-primary">Participation</span> to review
              each student’s organisation and procurement stage (read-only).
            </>
          ) : (
            <>
              {" "}
              Use <span className="font-semibold text-primary">Observe</span> to open a read-only
              view of a student’s organisation and procurement progress.
            </>
          )}
        </p>
      </DashboardPageIntro>
      <AdminStudentsPanel />
    </div>
  );
}
