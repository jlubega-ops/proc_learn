import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
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
  if (r !== Role.SYSTEM_ADMIN && r !== Role.EXAMINER) {
    redirect("/");
  }
  const afterCreatePath = r === Role.SYSTEM_ADMIN ? "/students/manage" : "/students/manage";

  return (
    <div className="w-full space-y-4">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Add student</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Student email must be digits only before @mubs.ac.ug and match the student number.
      </p>
      <AddStudentForm afterCreatePath={afterCreatePath} />
    </div>
  );
}
