import { redirect, notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { fetchAuthorizedProjectWorkspace } from "@/lib/projects/workspace-access";

export default async function ProjectOrgAdminLayout({ children, params }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/projects");

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (activeRole !== Role.STUDENT) notFound();

  const p = await params;
  const id = String(p?.id || "").trim();
  if (!id) notFound();

  const access = await fetchAuthorizedProjectWorkspace(prisma, {
    projectId: id,
    userId: user.id,
    activeRole,
  });
  if (!access) notFound();

  if (!access.canManageOrgAdmin) {
    redirect(`/projects/${id}`);
  }

  return children;
}
