import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { ProjectsPanel } from "@/components/projects/projects-panel";
import {
  BRAND_PAGE_SHELL_CLASS,
  DashboardPageIntro,
} from "@/components/layout/dashboard-page-intro";

export const metadata = {
  title: "Projects",
};

export default async function ProjectsPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login?next=/projects");
  }

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (activeRole === Role.STUDENT) {
    redirect("/organisation");
  }
  if (![Role.EXAMINER, Role.SYSTEM_ADMIN].includes(activeRole)) {
    redirect("/");
  }

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Projects"
        description="Projects are the parent workspace for student practice and assessments. Access, enrollment, publishing, and submissions are role-aware."
      />
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading projects…</p>}>
        <ProjectsPanel />
      </Suspense>
    </div>
  );
}
