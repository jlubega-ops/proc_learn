import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { ExaminerOrgExplorer } from "@/components/examiner/examiner-org-explorer";

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
    <Suspense fallback={null}>
      <ExaminerOrgExplorer
        participant
        studentId={studentId}
        apiBase={`/api/projects/${encodeURIComponent(id)}/participants/${encodeURIComponent(studentId)}`}
        backHref={`/projects/${id}/participants`}
        backLabel="Back to participants"
      />
    </Suspense>
  );
}
