import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getReadableAppSession } from "@/lib/auth/session";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { actsAsExaminerRole } from "@/lib/projects/access";
import { fetchAuthorizedProjectWorkspace, fetchAuthorizedOrgUserWorkspace } from "@/lib/projects/workspace-access";
import { ProjectTabs } from "@/components/projects/project-tabs";

export default async function ProjectDetailLayout({ children, params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  if (!id) notFound();

  const session = await getReadableAppSession();
  if (!session) redirect(`/login?next=/projects/${id}&reason=idle`);

  if (session.orgUserId) {
    const access = await fetchAuthorizedOrgUserWorkspace(prisma, session.orgUserId);
    if (!access || access.project.id !== id) notFound();

    return (
      <div className="w-full space-y-4">
        {children}
      </div>
    );
  }

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/projects/${id}`);
  const activeRole = sessionActiveRole(user) || Role.STUDENT;

  const access = await fetchAuthorizedProjectWorkspace(prisma, {
    projectId: id,
    userId: user.id,
    activeRole,
  });
  if (!access) notFound();

  const { project } = access;

  const canSeeSubmissionsTab =
    actsAsExaminerRole(activeRole) &&
    project.creatorRole === Role.EXAMINER &&
    (activeRole === Role.SYSTEM_ADMIN || project.ownerUserId === user.id);

  return (
    <div className="w-full space-y-4">
      <ProjectTabs projectId={id} canSeeSubmissionsTab={canSeeSubmissionsTab} />
      {children}
    </div>
  );
}
