import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { AcademicProjectParticipantsPanel } from "@/components/examiner/academic-project-participants-panel";

export const metadata = { title: "Project participants" };

/**
 * @param {{ params: Promise<{ id: string }> }} props
 */
export default async function ProjectParticipantsPage({ params }) {
  const user = await getSessionUser();
  const active = sessionActiveRole(user);
  if (!user) redirect("/login?next=/projects");
  if (active !== Role.EXAMINER && active !== Role.SYSTEM_ADMIN) {
    redirect("/");
  }
  const { id } = await params;
  return <AcademicProjectParticipantsPanel projectId={id} />;
}
