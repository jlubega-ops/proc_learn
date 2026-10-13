import Link from "next/link";
import Chip from "@mui/material/Chip";
import { format } from "date-fns";
import AddRounded from "@mui/icons-material/AddRounded";
import AssignmentTurnedInRounded from "@mui/icons-material/AssignmentTurnedInRounded";
import BlockRounded from "@mui/icons-material/BlockRounded";
import CampaignRounded from "@mui/icons-material/CampaignRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import EditNoteRounded from "@mui/icons-material/EditNoteRounded";
import EventAvailableRounded from "@mui/icons-material/EventAvailableRounded";
import EventNoteRounded from "@mui/icons-material/EventNoteRounded";
import GradingRounded from "@mui/icons-material/GradingRounded";
import GroupsRounded from "@mui/icons-material/GroupsRounded";
import HistoryRounded from "@mui/icons-material/HistoryRounded";
import HourglassTopRounded from "@mui/icons-material/HourglassTopRounded";
import LoginRounded from "@mui/icons-material/LoginRounded";
import MarkEmailUnreadRounded from "@mui/icons-material/MarkEmailUnreadRounded";
import PersonAddRounded from "@mui/icons-material/PersonAddRounded";
import PersonOffRounded from "@mui/icons-material/PersonOffRounded";
import PlayCircleRounded from "@mui/icons-material/PlayCircleRounded";
import QuizRounded from "@mui/icons-material/QuizRounded";
import ScheduleRounded from "@mui/icons-material/ScheduleRounded";
import SchoolRounded from "@mui/icons-material/SchoolRounded";
import TaskAltRounded from "@mui/icons-material/TaskAltRounded";
import TuneRounded from "@mui/icons-material/TuneRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import WorkOutlineRounded from "@mui/icons-material/WorkOutlineRounded";
import { DashboardPageIntro, BRAND_PAGE_SHELL_CLASS } from "@/components/layout/dashboard-page-intro";
import { DashboardStatTiles } from "@/components/layout/dashboard-stat-tiles";
import { BRAND_BTN_PRIMARY_CLASS, BRAND_CARD_CLASS, BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";
import { BRAND_YELLOW_ON_LIGHT } from "@/lib/brand-colors";
import { formatUserDisplayName } from "@/lib/user-display";
import { loadStaffDashboard } from "@/lib/staff-dashboard";

const SECONDARY_BTN_CLASS =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[color:var(--border-subtle)] bg-surface-card px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary";

const LINK_CLASS = "inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-primary hover:underline";

const WINDOW_CHIP = {
  OPEN: { label: "Open", color: "success" },
  NOT_YET: { label: "Not yet", color: "warning" },
  CLOSED: { label: "Closed", color: "error" },
  DRAFT: { label: "Draft", color: "warning" },
};

const ATTENTION_STYLE = {
  warning: { Icon: GradingRounded, color: BRAND_YELLOW_ON_LIGHT },
  info: { Icon: CampaignRounded, color: "var(--brand-blue)" },
  error: { Icon: ScheduleRounded, color: "var(--brand-red)" },
};

/**
 * System admin / examiner home: what needs action, then teaching and (admin) platform figures.
 * @param {{
 *   user: { firstName?: string; middleName?: string | null; lastName?: string; email?: string | null };
 *   isSystemAdmin: boolean;
 * }} props
 */
export async function StaffDashboardHome({ user, isSystemAdmin }) {
  const { teaching, system } = await loadStaffDashboard({ isSystemAdmin });
  const name = formatUserDisplayName(user) || "there";

  /** @type {{ key: string; tone: "warning" | "info" | "error"; text: string; href: string; action: string; closeAt?: Date | null }[]} */
  const attention = [];
  if (system?.maintenanceEnabled) {
    attention.push({
      key: "maintenance",
      tone: "error",
      text: "Maintenance mode is on",
      href: "/admin/site-settings",
      action: "Site settings",
    });
  }
  if (!teaching.currentYearLabel && isSystemAdmin) {
    attention.push({
      key: "academic-year",
      tone: "warning",
      text: "No current academic year",
      href: "/admin/academic-setup",
      action: "Academic setup",
    });
  }
  attention.push(...teaching.attention);

  const workTiles = [
    { key: "enrolled", label: "Enrolled", value: teaching.work.enrolled, Icon: SchoolRounded },
    { key: "in-progress", label: "In progress", value: teaching.work.inProgress, Icon: PlayCircleRounded },
    { key: "submitted", label: "Submitted", value: teaching.work.submitted, Icon: AssignmentTurnedInRounded },
    {
      key: "to-mark",
      label: "To mark",
      value: teaching.work.toMark,
      Icon: GradingRounded,
      tone: "warning",
      highlight: teaching.work.toMark > 0,
    },
    { key: "graded", label: "Graded", value: teaching.work.graded, Icon: TaskAltRounded, tone: "success" },
  ];

  const projectTiles = [
    { key: "open", label: "Open now", value: teaching.projects.open, Icon: EventAvailableRounded, href: "/projects" },
    {
      key: "upcoming",
      label: "Upcoming",
      value: teaching.projects.upcoming,
      Icon: HourglassTopRounded,
      tone: "warning",
      href: "/projects",
    },
    {
      key: "drafts",
      label: "Drafts",
      value: teaching.projects.drafts,
      Icon: EditNoteRounded,
      tone: "warning",
      href: "/projects",
    },
    { key: "assessments", label: "Assessments", value: teaching.projects.assessments, Icon: QuizRounded, href: "/projects" },
    { key: "practice", label: "Practice", value: teaching.projects.practice, Icon: WorkOutlineRounded, href: "/projects" },
  ];

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title={`Welcome, ${name}`}
        description={isSystemAdmin ? "Platform and teaching overview." : "Teaching overview."}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <EventNoteRounded sx={{ fontSize: 18, color: "var(--brand-blue)" }} aria-hidden />
          {teaching.currentYearLabel ? (
            <span>Academic year: {teaching.currentYearLabel}</span>
          ) : (
            <Chip size="small" color="warning" label="No current academic year" />
          )}
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link href="/projects" title="Create or manage projects" className={`${BRAND_BTN_PRIMARY_CLASS} cursor-pointer gap-1.5`}>
            <AddRounded sx={{ fontSize: 18 }} aria-hidden />
            Projects
          </Link>
          {isSystemAdmin ? (
            <Link href="/students/new" title="Add a student" className={SECONDARY_BTN_CLASS}>
              <PersonAddRounded sx={{ fontSize: 18, color: "var(--brand-blue)" }} aria-hidden />
              Add student
            </Link>
          ) : null}
          <Link href="/academic/participation" title="Student organisations and progress" className={SECONDARY_BTN_CLASS}>
            <VisibilityRounded sx={{ fontSize: 18, color: "var(--brand-blue)" }} aria-hidden />
            Participation
          </Link>
          {isSystemAdmin ? (
            <Link href="/admin/staff/new" title="Add a staff member" className={SECONDARY_BTN_CLASS}>
              <GroupsRounded sx={{ fontSize: 18, color: "var(--brand-blue)" }} aria-hidden />
              Add staff
            </Link>
          ) : null}
        </div>
      </DashboardPageIntro>

      <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`} aria-labelledby="staff-attention">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="staff-attention" className={BRAND_SECTION_TITLE_CLASS}>
            Needs attention
          </h2>
          {teaching.attentionTotal > teaching.attention.length ? (
            <Link href="/projects" title="Open all projects" className={LINK_CLASS}>
              View all
              <ChevronRightRounded sx={{ fontSize: 18 }} aria-hidden />
            </Link>
          ) : null}
        </div>
        {attention.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">All caught up.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[color:var(--border-subtle)]">
            {attention.map((item) => {
              const { Icon, color } = ATTENTION_STYLE[item.tone];
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    title={item.action}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-2.5 transition hover:bg-[color:var(--nav-active-bg)]"
                  >
                    <Icon sx={{ fontSize: 20, color }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{item.text}</span>
                      {item.closeAt ? (
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                          {format(item.closeAt, "MMM d, yyyy h:mm a")}
                        </span>
                      ) : null}
                    </span>
                    <span className="hidden shrink-0 text-xs font-semibold text-primary sm:inline">{item.action}</span>
                    <ChevronRightRounded sx={{ fontSize: 20, color: "var(--brand-blue)" }} aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`} aria-labelledby="staff-work">
          <h2 id="staff-work" className={BRAND_SECTION_TITLE_CLASS}>
            Student work
          </h2>
          <DashboardStatTiles items={workTiles} gridClassName="grid-cols-2 sm:grid-cols-3 xl:grid-cols-3" />
        </section>
        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`} aria-labelledby="staff-projects">
          <h2 id="staff-projects" className={BRAND_SECTION_TITLE_CLASS}>
            Projects
          </h2>
          <DashboardStatTiles items={projectTiles} gridClassName="grid-cols-2 sm:grid-cols-3 xl:grid-cols-3" />
        </section>
      </div>

      {system ? (
        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`} aria-labelledby="staff-users">
          <h2 id="staff-users" className={BRAND_SECTION_TITLE_CLASS}>
            Users
          </h2>
          <DashboardStatTiles
            gridClassName="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
            items={[
              { key: "students", label: "Students", value: system.users.students, Icon: SchoolRounded, href: "/students/manage" },
              { key: "staff", label: "Staff", value: system.users.staff, Icon: GroupsRounded, href: "/admin/staff" },
              { key: "active", label: "Active · 7 days", value: system.users.activeWeek, Icon: LoginRounded, tone: "success" },
              {
                key: "never",
                label: "Never signed in",
                value: system.users.neverSignedIn,
                hint: "Students",
                Icon: PersonOffRounded,
                tone: "warning",
                href: "/students/manage",
              },
              {
                key: "pending",
                label: "Pending activation",
                value: system.users.pending,
                Icon: MarkEmailUnreadRounded,
                tone: "warning",
                href: "/admin/staff",
              },
              {
                key: "suspended",
                label: "Suspended",
                value: system.users.suspended,
                Icon: BlockRounded,
                tone: "error",
                highlight: system.users.suspended > 0,
              },
            ]}
          />
        </section>
      ) : null}

      <div className={`grid gap-4 ${system ? "xl:grid-cols-5" : ""}`}>
        <section
          className={`${BRAND_CARD_CLASS} min-w-0 p-4 sm:p-5 ${system ? "xl:col-span-3" : ""}`}
          aria-labelledby="staff-recent-projects"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="staff-recent-projects" className={BRAND_SECTION_TITLE_CLASS}>
              Recent projects
            </h2>
            <Link href="/projects" title="Open all projects" className={LINK_CLASS}>
              View all
              <ChevronRightRounded sx={{ fontSize: 18 }} aria-hidden />
            </Link>
          </div>
          {teaching.recentProjects.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No projects yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--border-subtle)] text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    <th className="py-2 pr-3 font-semibold">Project</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 pr-3 text-right font-semibold">Enrolled</th>
                    <th className="py-2 pr-3 text-right font-semibold">Submitted</th>
                    <th className="py-2 text-right font-semibold">To mark</th>
                  </tr>
                </thead>
                <tbody>
                  {teaching.recentProjects.map((p) => {
                    const chip = WINDOW_CHIP[p.window] || WINDOW_CHIP.OPEN;
                    return (
                      <tr key={p.id} className="border-b border-[color:var(--border-subtle)] last:border-0">
                        <td className="max-w-[16rem] py-2.5 pr-3">
                          <Link
                            href={`/projects/${p.id}/results`}
                            title={`Open ${p.name}`}
                            className="block cursor-pointer truncate font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {p.name}
                          </Link>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {p.purpose === "ASSESSMENT" ? "Assessment" : "Practice"}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <Chip size="small" color={chip.color} label={chip.label} />
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{p.enrolled}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{p.submitted}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {p.toMark > 0 ? (
                            <Chip size="small" color="warning" label={p.toMark} />
                          ) : (
                            <span className="text-zinc-500 dark:text-zinc-400">0</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {system ? (
          <section className={`${BRAND_CARD_CLASS} min-w-0 p-4 sm:p-5 xl:col-span-2`} aria-labelledby="staff-activity">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="staff-activity" className={BRAND_SECTION_TITLE_CLASS}>
                Recent activity
              </h2>
              <Link href="/admin/activity" title="Open activity logs" className={LINK_CLASS}>
                View all
                <ChevronRightRounded sx={{ fontSize: 18 }} aria-hidden />
              </Link>
            </div>
            {system.recentActivity.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No activity yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-[color:var(--border-subtle)]">
                {system.recentActivity.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 py-2.5">
                    <HistoryRounded sx={{ fontSize: 18, color: "var(--brand-blue)", mt: "2px" }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{e.label}</span>
                      <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {e.actor} · {format(e.createdAt, "MMM d, h:mm a")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[color:var(--border-subtle)] pt-3 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">Active programmes: {system.activeProgrammes}</span>
              <Link href="/admin/site-settings" title="Maintenance mode and platform switches" className={LINK_CLASS}>
                <TuneRounded sx={{ fontSize: 16 }} aria-hidden />
                {system.maintenanceEnabled ? "Maintenance on" : "Site settings"}
              </Link>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
