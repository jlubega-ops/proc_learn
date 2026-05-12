import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canManageStudents } from "@/lib/api/student-scope";
import { AdminStudentsPanel } from "@/components/admin/admin-students-panel";

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
    <div className="w-full space-y-4">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Students</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Search and filter by programme or academic year. Changes are logged and system administrators
        are notified.
        {r === Role.EXAMINER ? (
          <>
            {" "}
            As an examiner you can add and maintain student records, and suspend or reactivate student
            accounts. Programme and staff settings stay with system administrators.
          </>
        ) : null}
      </p>
      <AdminStudentsPanel />
    </div>
  );
}
