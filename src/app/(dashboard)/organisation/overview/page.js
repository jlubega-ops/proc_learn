import Chip from "@mui/material/Chip";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";
import { prisma } from "@/lib/prisma";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
  BRAND_PAGE_LEAD_CLASS,
} from "@/components/layout/dashboard-page-intro";
import { BRAND_BTN_PRIMARY_CLASS, BRAND_CARD_CLASS, BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";
import { RichHtml } from "@/components/ui/rich-html";

export const metadata = {
  title: "Project overview",
};

/**
 * Project overview (instructions, question, details) — only for attempt organisations.
 * Personal org Overview remains /organisation.
 */
export default async function StudentProjectOverviewPage() {
  const org = await requireStudentOrganisation();

  const project = await prisma.project.findUnique({
    where: { id: org.projectId },
    include: {
      sourceAcademicProject: {
        select: {
          id: true,
          name: true,
          purpose: true,
          description: true,
          instructions: true,
          questionText: true,
          questionFileUrl: true,
          organizationName: true,
          openAt: true,
          closeAt: true,
          durationSeconds: true,
        },
      },
    },
  });
  if (!project) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  if (!project.isAttemptOrg || !project.sourceAcademicProject) {
    redirect("/");
  }

  const academic = project.sourceAcademicProject;
  const purposeLabel = academic.purpose === "ASSESSMENT" ? "Assessment" : "Practice";
  const detailHref =
    academic.purpose === "ASSESSMENT"
      ? `/academic/assessments/${academic.id}`
      : `/academic/practice/${academic.id}`;
  const orgTitle = project.organizationName || project.name;

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title="Project overview"
        description={`Instructions and question for “${academic.name}” while you work in ${orgTitle}.`}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip
            size="small"
            color={academic.purpose === "ASSESSMENT" ? "warning" : "info"}
            label={`${purposeLabel} organisation`}
          />
          <Chip size="small" color="primary" label={orgTitle} />
        </div>
      </DashboardPageIntro>

      <div className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Project details</h2>
        <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
          <span className="font-semibold text-foreground">{academic.name}</span>
          {academic.organizationName && academic.organizationName !== academic.name
            ? ` · Organisation name: ${academic.organizationName}`
            : null}
        </p>
        {academic.description ? (
          <p className={`mt-2 whitespace-pre-wrap ${BRAND_PAGE_LEAD_CLASS}`}>{academic.description}</p>
        ) : null}
      </div>

      <div className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Instructions</h2>
        <RichHtml
          html={academic.instructions}
          empty="Your examiner has not added special instructions. Use Manage Organisation to complete the required procurement work for this project."
        />
      </div>

      <div className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Question / task</h2>
        <RichHtml
          html={academic.questionText}
          empty="No question text was provided for this project."
        />
        {academic.questionFileUrl ? (
          <p className="mt-3">
            <a
              href={academic.questionFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer font-medium text-primary underline-offset-2 hover:underline"
            >
              Open question file
            </a>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/organisation"
          className={`${BRAND_BTN_PRIMARY_CLASS} inline-flex cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold`}
        >
          Organisation dashboard
        </Link>
        <Link
          href={detailHref}
          className="inline-flex cursor-pointer rounded-lg border border-[color:var(--border-subtle)] px-4 py-2 text-sm font-semibold text-foreground"
        >
          Attempt details
        </Link>
      </div>
    </div>
  );
}
