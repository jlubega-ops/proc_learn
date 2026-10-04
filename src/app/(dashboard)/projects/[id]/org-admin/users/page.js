import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { ensureProjectCode } from "@/lib/projects/project-identity";
import { ProjectOrgUsersPanel } from "@/components/projects/project-org-users-panel";
import { DashboardPageIntro } from "@/components/layout/dashboard-page-intro";

export default async function ProjectOrgUsersPage({ params }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/projects");
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (activeRole !== Role.STUDENT) notFound();

  const p = await params;
  const id = String(p?.id || "").trim();
  if (!id) notFound();

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  await ensureProjectCode(prisma, project.id);

  return (
    <div className="w-full space-y-4">
      <DashboardPageIntro title="Users" description="People who work in your organisation." />
      <ProjectOrgUsersPanel projectId={project.id} />
    </div>
  );
}
