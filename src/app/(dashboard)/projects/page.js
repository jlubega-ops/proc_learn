import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { ProjectsPanel } from "@/components/projects/projects-panel";

export const metadata = {
  title: "Projects",
};

export default async function ProjectsPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login?next=/projects");
  }

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (![Role.STUDENT, Role.LECTURER, Role.EXAMINER].includes(activeRole)) {
    redirect("/");
  }

  return (
    <div className="w-full space-y-4">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Projects</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Projects are the parent workspace for student practice and assignments. Access, enrollment,
        publishing, and submissions are role-aware.
      </p>
      <ProjectsPanel />
    </div>
  );
}
