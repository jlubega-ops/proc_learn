import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { fetchAuthorizedProjectWorkspace } from "@/lib/projects/workspace-access";
import { ProjectTabs } from "@/components/projects/project-tabs";

export default async function ProjectDetailLayout({ children, params }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/projects");
  const activeRole = sessionActiveRole(user) || Role.STUDENT;

  const p = await params;
  const id = String(p?.id || "").trim();
  if (!id) notFound();

  const access = await fetchAuthorizedProjectWorkspace(prisma, {
    projectId: id,
    userId: user.id,
    activeRole,
  });
  if (!access) notFound();

  const { project } = access;

  const canSeeSubmissionsTab =
    activeRole === Role.EXAMINER &&
    project.ownerUserId === user.id &&
    project.creatorRole === Role.EXAMINER;

  return (
    <div className="w-full space-y-4">
      <ProjectTabs projectId={id} canSeeSubmissionsTab={canSeeSubmissionsTab} />
      {children}
    </div>
  );
}
