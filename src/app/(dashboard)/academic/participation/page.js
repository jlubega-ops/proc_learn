import { redirect } from "next/navigation";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canObserveStudentOrganisation } from "@/lib/academic/examiner-observation-access";
import { ExaminerParticipationPanel } from "@/components/examiner/examiner-participation-panel";

export const metadata = { title: "Student participation" };

export default async function AcademicParticipationPage() {
  const user = await getSessionUser();
  const active = sessionActiveRole(user);
  if (!user) {
    redirect("/login?next=/academic/participation");
  }
  if (!canObserveStudentOrganisation({ activeRole: active })) {
    redirect("/");
  }

  return <ExaminerParticipationPanel />;
}
