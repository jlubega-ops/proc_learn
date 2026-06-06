import Link from "next/link";
import BadgeRounded from "@mui/icons-material/BadgeRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";

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
    <div className="w-full space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Project settings</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Configure organisation roles and student project behaviour. Changes to project roles apply to all
          student workspaces; project-level settings apply to individual student projects.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              title={c.title}
              className="flex h-full flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-[#008bd0]/40 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <c.Icon aria-hidden sx={{ fontSize: 28, color: "#008bd0", mb: 1 }} />
              <h2 className="font-semibold text-zinc-900 dark:text-white">{c.title}</h2>
              <p className="mt-1 flex-1 text-sm text-zinc-600 dark:text-zinc-400">{c.desc}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
