import Chip from "@mui/material/Chip";
import { format, isValid, parseISO } from "date-fns";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import { prisma } from "@/lib/prisma";
import { formatUserDisplayName } from "@/lib/user-display";

export const metadata = {
  title: "Project details",
};

export default async function ProjectDetailsPage({ params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  const ctx = await getProjectWorkspacePageContext(id);

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      owner: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
  });
  if (!project) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  if (ctx.viewer === "org") {
    return (
      <div className="w-full space-y-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">
            {project.organizationName || project.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as{" "}
            <span className="font-semibold text-[#008bd0]">
              {ctx.orgUser.projectOrgRole?.name}
            </span>
            {ctx.orgUser.department?.name
              ? ` · ${ctx.orgUser.department.name}`
              : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chip size="small" label={purposeLabel(project.purpose)} color={purposeColor(project.purpose)} />
            <Chip size="small" label={project.status} color={statusColor(project.status)} />
            <Chip size="small" label="Published" color="success" />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">About this project</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {project.description || "—"}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Your account</h2>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            {formatUserDisplayName(ctx.orgUser)} — use{" "}
            <span className="font-semibold">My account</span> in the sidebar for full details and the
            pages your role can open.
          </p>
        </div>
      </div>
    );
  }

  const isStudentOwnedProject =
    project.creatorRole === "STUDENT" && project.ownerUserId === ctx.user.id;
  const showStaffFields = !isStudentOwnedProject;

  return (
    <div className="w-full space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">{project.name}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Owner: {project.owner?.firstName || ""} {project.owner?.lastName || ""} (
          {project.owner?.email || "—"})
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip size="small" label={purposeLabel(project.purpose)} color={purposeColor(project.purpose)} />
          <Chip size="small" label={project.status} color={statusColor(project.status)} />
          <Chip size="small" label={project.visibility} color={visibilityColor(project.visibility)} />
          {showStaffFields ? (
            <Chip
              size="small"
              label={project.isPublished ? "Published" : "Not published"}
              color={project.isPublished ? "success" : "warning"}
            />
          ) : null}
        </div>
      </div>

      {showStaffFields ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Schedule</h2>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">Open: {fmtDate(project.openAt)}</p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">Close: {fmtDate(project.closeAt)}</p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Duration: {fmtDuration(project.durationSeconds)}
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Description</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
          {project.description || "—"}
        </p>
      </div>

      {showStaffFields ? (
        <>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Instructions</h2>
            {project.instructions ? (
              <div
                className="prose prose-sm mt-2 max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: project.instructions }}
              />
            ) : (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">—</p>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Question</h2>
            {project.questionText ? (
              <div
                className="prose prose-sm mt-2 max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: project.questionText }}
              />
            ) : (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">—</p>
            )}
            {project.questionFileUrl ? (
              <a
                href={project.questionFileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sm text-primary underline"
              >
                Open question file
              </a>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function fmtDate(value) {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : new Date(value);
  if (!isValid(d)) return "—";
  return format(d, "MMM d, yyyy h:mm a");
}

function fmtDuration(seconds) {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function statusColor(status) {
  if (status === "COMPLETED" || status === "SUBMITTED") return "success";
  if (status === "IN_PROGRESS") return "info";
  if (status === "NOT_STARTED") return "warning";
  return "primary";
}

function visibilityColor(visibility) {
  return visibility === "PUBLIC" ? "secondary" : "warning";
}

function purposeLabel(purpose) {
  return String(purpose || "").toUpperCase() === "ASSESSMENT" ? "Assessment" : "Practice";
}

function purposeColor(purpose) {
  return String(purpose || "").toUpperCase() === "ASSESSMENT" ? "secondary" : "primary";
}
