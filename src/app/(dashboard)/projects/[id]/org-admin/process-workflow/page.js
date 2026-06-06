import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { canViewProjectByRole } from "@/lib/projects/access";

export default async function ProjectProcessWorkflowPage({ params }) {
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

  return (
    <div className="w-full rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Process workflow</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        Configure process workflows for <span className="font-semibold">{project.name}</span> in this isolated
        organisation.
      </p>
    </div>
  );
}
