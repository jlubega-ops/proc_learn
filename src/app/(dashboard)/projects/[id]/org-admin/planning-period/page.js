import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { ProjectOrgPlanningPeriodsPanel } from "@/components/projects/project-org-planning-periods-panel";

export default async function ProjectPlanningPeriodPage({ params }) {
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

  return (
    <div className="w-full space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Planning period</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Manage planning periods for{" "}
          <span className="font-semibold">{project.name}</span> in this isolated organisation.
          Each period is linked to an active financial year; its length is calculated from the
          dates you choose.
        </p>
      </div>
      <ProjectOrgPlanningPeriodsPanel projectId={project.id} />
    </div>
  );
}
