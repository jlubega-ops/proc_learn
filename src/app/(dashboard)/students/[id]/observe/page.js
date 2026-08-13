import { redirect } from "next/navigation";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canObserveStudentOrganisation } from "@/lib/academic/examiner-observation-access";
import { ExaminerStudentObservePanel } from "@/components/examiner/examiner-student-observe-panel";

export const metadata = {
  title: "Observe student",
};

/**
 * @param {{ params: Promise<{ id: string }> }} props
 */
export default async function ObserveStudentPage({ params }) {
  const user = await getSessionUser();
  const active = sessionActiveRole(user);
  if (!user) {
    redirect("/login?next=/academic/participation");
  }
  if (!canObserveStudentOrganisation({ activeRole: active })) {
    redirect("/");
  }

  const { id } = await params;

  return <ExaminerStudentObservePanel studentId={id} />;
}
