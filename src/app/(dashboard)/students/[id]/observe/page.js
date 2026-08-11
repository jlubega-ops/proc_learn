import { redirect } from "next/navigation";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canObserveStudentOrganisation } from "@/lib/academic/examiner-observation-access";
import { ExaminerStudentObservePanel } from "@/components/examiner/examiner-student-observe-panel";

export const metadata = {
  title: "Observe student",
};

/**
 * @param {{ params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }} props
 */
export default async function ObserveStudentPage({ params, searchParams }) {
  const user = await getSessionUser();
  const active = sessionActiveRole(user);
  if (!user) {
    redirect("/login?next=/students/manage");
  }
  if (!canObserveStudentOrganisation({ activeRole: active })) {
    redirect("/");
  }

  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp?.tab === "string" ? sp.tab : "overview";

  return <ExaminerStudentObservePanel studentId={id} initialTab={tab} />;
}
