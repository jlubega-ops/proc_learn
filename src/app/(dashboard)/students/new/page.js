import { redirect } from "next/navigation";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canManageStudents } from "@/lib/api/student-scope";
import { AddStudentForm } from "@/components/admin/add-student-form";

export const metadata = {
  title: "Add student",
};

export default async function AddStudentPage() {
  const user = await getSessionUser();
  const r = sessionActiveRole(user);
  if (!user) {
    redirect("/login?next=/students/new");
  }
  if (!canManageStudents(r)) {
    redirect("/");
  }

  return (
    <div className="w-full space-y-4">
      <h1 className="text-lg font-semibold text-foreground sm:text-xl">Add student</h1>
      <AddStudentForm afterCreatePath="/students/manage" />
    </div>
  );
}
