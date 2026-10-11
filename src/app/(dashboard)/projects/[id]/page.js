import Chip from "@mui/material/Chip";
import { format, isValid } from "date-fns";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import { prisma } from "@/lib/prisma";
import { formatUserDisplayName } from "@/lib/user-display";
import { sanitizeRichHtml } from "@/lib/sanitize-rich-html";
import { loadOrgProfile } from "@/lib/projects/org-profile";
import { OrgProfileView } from "@/components/projects/org-profile-view";
import { BRAND_CARD_CLASS, BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";
import { formatDurationHms } from "@/lib/academic/attempt-timer-format";
import { projectCampusesLabel } from "@/lib/academic/project-campuses";

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
      owner: { select: { firstName: true, lastName: true, email: true } },
      academicYear: { select: { label: true } },
      programme: { select: { name: true, shortName: true } },
      campuses: { select: { campus: true } },
      _count: { select: { enrollments: true } },
    },
  });
  if (!project) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  if (ctx.viewer === "org") {
    const displayName = formatUserDisplayName(ctx.orgUser);
    const roleName = ctx.orgUser.projectOrgRole?.name || "Organisation role";
    const departmentName = ctx.orgUser.department?.name || null;
    const profile = await loadOrgProfile(prisma, id);

    return (
      <div className="w-full space-y-4">
        <div className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">
            {project.organizationName || project.name}
          </h1>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold text-primary">{displayName || "Organisation user"}</span>
            {" · "}
            <span className="font-semibold text-primary">{roleName}</span>
            {departmentName ? ` · ${departmentName}` : ""}
          </p>
          {project.isAttemptOrg ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Chip size="small" color="primary" label={purposeLabel(project.purpose)} />
            </div>
          ) : null}
        </div>

        {profile ? <OrgProfileView profile={profile} /> : null}
      </div>
    );
  }

  const isExaminerProject = project.creatorRole === "EXAMINER";
  const windowInfo = windowState(project);

  const overview = [
    { label: "Organisation name", value: project.organizationName || "—" },
    { label: "Purpose", value: purposeLabel(project.purpose) },
    { label: "Academic year", value: project.academicYear?.label || "—" },
    {
      label: "Programme",
      value: project.programme
        ? project.programme.shortName
          ? `${project.programme.shortName} — ${project.programme.name}`
          : project.programme.name
        : "—",
    },
    ...(isExaminerProject
      ? [
          { label: "Campuses", value: projectCampusesLabel(project.campuses) },
          { label: "Enrolled students", value: String(project._count.enrollments) },
          { label: "Enrolment key", value: project.enrollmentKey || "None" },
        ]
      : []),
    {
      label: "Created by",
      value: `${project.owner?.firstName || ""} ${project.owner?.lastName || ""}`.trim() || "—",
    },
    { label: "Created on", value: fmtDate(project.createdAt, "MMM d, yyyy") },
  ];

  const schedule = [
    { label: "Opens", value: project.openAt ? fmtDate(project.openAt) : "Immediately" },
    { label: "Closes", value: project.closeAt ? fmtDate(project.closeAt) : "No close date" },
    { label: "Time allowed", value: formatDurationHms(project.durationSeconds) },
    {
      label: "Attempts allowed",
      value: project.maxAttempts == null || project.maxAttempts === 0 ? "Unlimited" : String(project.maxAttempts),
    },
    { label: "Edit after submit", value: project.allowEditAfterSubmit ? "Allowed" : "Not allowed" },
  ];

  return (
    <div className="w-full space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Overview">
          <FactList items={overview} />
        </Section>
        <Section
          title="Schedule"
          action={<Chip size="small" color={windowInfo.color} label={windowInfo.label} />}
        >
          <FactList items={schedule} />
        </Section>
      </div>

      <Section title="Description">
        <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
          {project.description || "—"}
        </p>
      </Section>

      <Section title="Instructions">
        {project.instructions ? (
          <div
            className="rich-html max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(project.instructions) }}
          />
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">—</p>
        )}
      </Section>

      <Section title="Question">
        {project.questionText ? (
          <div
            className="rich-html max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(project.questionText) }}
          />
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">—</p>
        )}
        {project.questionFileUrl ? (
          <a
            href={project.questionFileUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block cursor-pointer text-sm text-primary underline"
          >
            Open question file
          </a>
        ) : null}
      </Section>
    </div>
  );
}

/**
 * @param {{ title: string; action?: import("react").ReactNode; children: import("react").ReactNode }} p
 */
function Section({ title, action = null, children }) {
  return (
    <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`} aria-label={title}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={BRAND_SECTION_TITLE_CLASS}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** @param {{ items: { label: string; value: string }[] }} p */
function FactList({ items }) {
  return (
    <dl className="divide-y divide-[color:var(--border-subtle)] text-sm">
      {items.map((item) => (
        <div key={item.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
          <dt className="text-zinc-500 dark:text-zinc-400">{item.label}</dt>
          <dd className="min-w-0 break-words text-right font-medium text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * @param {Date | string | null} value
 * @param {string} [pattern]
 */
function fmtDate(value, pattern = "MMM d, yyyy h:mm a") {
  if (!value) return "—";
  const d = new Date(value);
  if (!isValid(d)) return "—";
  return format(d, pattern);
}

/**
 * @param {{ openAt: Date | null; closeAt: Date | null }} project
 * @returns {{ label: string; color: 'warning' | 'primary' | 'error' }}
 */
function windowState(project) {
  const now = Date.now();
  if (project.openAt && now < new Date(project.openAt).getTime()) {
    return { label: "Upcoming", color: "warning" };
  }
  if (project.closeAt && now > new Date(project.closeAt).getTime()) {
    return { label: "Closed", color: "error" };
  }
  return { label: "Open", color: "primary" };
}

function purposeLabel(purpose) {
  return String(purpose || "").toUpperCase() === "ASSESSMENT" ? "Assessment" : "Practice";
}
