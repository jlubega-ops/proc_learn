import Link from "next/link";
import BadgeRounded from "@mui/icons-material/BadgeRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import { BRAND_CARD_CLASS, brandIconSx } from "@/lib/brand-ui";
import {
  BRAND_PAGE_SHELL_CLASS,
  DashboardPageIntro,
} from "@/components/layout/dashboard-page-intro";

export const metadata = {
  title: "Project settings",
};

export default function ProjectSettingsPage() {
  const cards = [
    {
      href: "/project-settings/roles",
      title: "Project roles",
      desc: "Organisation roles students use inside their project workspace (Admin, Procurement Officer, etc.).",
      Icon: BadgeRounded,
    },
    {
      href: "/projects?scope=student",
      title: "Student projects",
      desc: "Open the projects list to configure settings on student-owned projects.",
      Icon: SettingsRounded,
    },
  ];

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Project settings"
        description="Configure organisation roles and student project behaviour. Changes to project roles apply to all student workspaces; project-level settings apply to individual student projects."
      />
      <ul className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              title={c.title}
              className={`flex h-full flex-col ${BRAND_CARD_CLASS} border-t-brand-yellow p-4 transition hover:border-primary/40 hover:shadow-md`}
            >
              <c.Icon aria-hidden sx={{ ...brandIconSx, fontSize: 28, mb: 1 }} />
              <h2 className="font-semibold text-foreground">{c.title}</h2>
              <p className="mt-1 flex-1 text-sm text-zinc-600 dark:text-zinc-400">{c.desc}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
