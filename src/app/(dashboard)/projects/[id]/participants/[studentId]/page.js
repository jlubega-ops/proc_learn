import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { ExaminerStudentObservePanel } from "@/components/examiner/examiner-student-observe-panel";

export const metadata = { title: "Student project report" };

/**
 * @param {{ params: Promise<{ id: string; studentId: string }> }} props
 */
export default async function AcademicProjectStudentReportPage({ params }) {
  const user = await getSessionUser();
  const active = sessionActiveRole(user);
  if (!user) redirect("/login?next=/projects");
  if (active !== Role.EXAMINER && active !== Role.SYSTEM_ADMIN) {
    redirect("/");
  }
  const { id, studentId } = await params;
  return (
    <ExaminerStudentObservePanel
      studentId={studentId}
      academicProjectId={id}
      backHref={`/projects/${id}/participants`}
      backLabel="Back to participants"
    />
  );
}
