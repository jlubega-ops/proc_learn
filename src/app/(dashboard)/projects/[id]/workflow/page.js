import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { canViewProjectByRole } from "@/lib/projects/access";

export default async function ProjectWorkflowRedirectPage({ params }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/projects");
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (activeRole !== Role.STUDENT) notFound();

  const p = await params;
  const id = String(p?.id || "").trim();
  if (!id) notFound();

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      ownerUserId: true,
      creatorRole: true,
      purpose: true,
      visibility: true,
      isPublished: true,
      closeAt: true,
    },
  });
  if (!canViewProjectByRole({ userId: user.id, activeRole, project })) notFound();

  redirect(`/projects/${id}/org-admin/process-workflow`);
}
