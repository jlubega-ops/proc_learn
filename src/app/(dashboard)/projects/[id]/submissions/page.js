import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import Chip from "@mui/material/Chip";
import { format, isValid, parseISO } from "date-fns";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { actsAsExaminerRole } from "@/lib/projects/access";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "Project submissions",
};

function fmt(value) {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : new Date(value);
  if (!isValid(d)) return "—";
  return format(d, "MMM d, yyyy h:mm a");
}

export default async function ProjectSubmissionsPage({ params }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/projects");
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (!actsAsExaminerRole(activeRole)) redirect("/projects");

  const p = await params;
  const id = String(p?.id || "").trim();
  if (!id) notFound();

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.creatorRole !== Role.EXAMINER) {
    notFound();
  }
  if (activeRole === Role.EXAMINER && project.ownerUserId !== user.id) {
    notFound();
  }

  const [notStarted, inProgress, submitted, totalEnrolled, rows] = await Promise.all([
    prisma.projectEnrollment.count({ where: { projectId: id, status: "NOT_STARTED" } }),
    prisma.projectEnrollment.count({ where: { projectId: id, status: "IN_PROGRESS" } }),
    prisma.projectEnrollment.count({ where: { projectId: id, status: "SUBMITTED" } }),
    prisma.projectEnrollment.count({ where: { projectId: id } }),
    prisma.projectEnrollment.findMany({
      where: { projectId: id },
      orderBy: { enrolledAt: "desc" },
      include: {
        student: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
  ]);

  return (
    <div className="w-full space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">
        Submissions — {project.name}
      </h1>
      <div className="flex flex-wrap gap-2">
        <Chip label={`Enrolled: ${totalEnrolled}`} color="primary" />
        <Chip label={`Not started: ${notStarted}`} color="warning" />
        <Chip label={`In progress: ${inProgress}`} color="info" />
        <Chip label={`Submitted: ${submitted}`} color="success" />
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="px-3 py-2 text-left">Student</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Enrolled</th>
              <th className="px-3 py-2 text-left">Started</th>
              <th className="px-3 py-2 text-left">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="px-3 py-2">
                  {r.student?.firstName || ""} {r.student?.lastName || ""}
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{r.student?.email || "—"}</div>
                </td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2">{fmt(r.enrolledAt)}</td>
                <td className="px-3 py-2">{fmt(r.startedAt)}</td>
                <td className="px-3 py-2">{fmt(r.submittedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

