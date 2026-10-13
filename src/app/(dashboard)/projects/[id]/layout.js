import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getReadableAppSession } from "@/lib/auth/session";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { actsAsExaminerRole, canManageExaminerProject } from "@/lib/projects/access";
import {
  fetchAuthorizedProjectWorkspace,
  fetchAuthorizedOrgUserWorkspace,
} from "@/lib/projects/workspace-access";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { projectCampusesLabel } from "@/lib/academic/project-campuses";

export default async function ProjectDetailLayout({ children, params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  if (!id) notFound();

  const session = await getReadableAppSession();
  if (!session) redirect(`/login?next=/projects/${id}&reason=idle`);

  if (session.orgUserId) {
    const access = await fetchAuthorizedOrgUserWorkspace(
      prisma,
      session.orgUserId,
    );
    if (!access || access.project.id !== id) notFound();

    return <div className="w-full space-y-4">{children}</div>;
  }

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/projects/${id}`);
  const activeRole = sessionActiveRole(user) || Role.STUDENT;

  if (activeRole === Role.STUDENT) {
    redirect("/organisation");
  }

  const access = await fetchAuthorizedProjectWorkspace(prisma, {
    projectId: id,
    userId: user.id,
    activeRole,
  });
  if (!access) notFound();

  const { project } = access;

  const canSeeSubmissionsTab =
    actsAsExaminerRole(activeRole) && project.creatorRole === Role.EXAMINER;

  const info = await prisma.project.findUnique({
    where: { id },
    select: {
      name: true,
      organizationName: true,
      purpose: true,
      isPublished: true,
      openAt: true,
      closeAt: true,
      owner: { select: { firstName: true, lastName: true } },
      academicYear: { select: { label: true } },
      programme: { select: { name: true, shortName: true } },
      campuses: { select: { campus: true } },
    },
  });
  const header = info
    ? {
        name: info.name,
        organizationName: info.organizationName,
        purpose: info.purpose,
        windowState: projectWindowState(info),
        isPublished: Boolean(info.isPublished),
        canManage: canManageExaminerProject({ activeRole, project }),
        facts: [
          info.academicYear ? { label: "Academic year", value: info.academicYear.label } : null,
          info.programme
            ? { label: "Programme", value: info.programme.shortName || info.programme.name }
            : null,
          canSeeSubmissionsTab
            ? { label: "Campuses", value: projectCampusesLabel(info.campuses) }
            : null,
          {
            label: "Created by",
            value: `${info.owner?.firstName || ""} ${info.owner?.lastName || ""}`.trim() || "—",
          },
        ].filter(Boolean),
      }
    : null;

  return (
    <div className="w-full space-y-4">
      <ProjectTabs projectId={id} canSeeSubmissionsTab={canSeeSubmissionsTab} header={header} />
      {children}
    </div>
  );
}

/**
 * @param {{ openAt: Date | null; closeAt: Date | null }} p
 * @returns {'upcoming' | 'open' | 'closed'}
 */
function projectWindowState({ openAt, closeAt }) {
  const now = Date.now();
  if (openAt && now < new Date(openAt).getTime()) return "upcoming";
  if (closeAt && now > new Date(closeAt).getTime()) return "closed";
  return "open";
}
