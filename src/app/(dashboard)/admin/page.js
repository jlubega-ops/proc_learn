import Link from "next/link";
import { BRAND_CARD_CLASS } from "@/lib/brand-ui";
import {
  DashboardPageIntro,
  BRAND_PAGE_SHELL_CLASS,
} from "@/components/layout/dashboard-page-intro";

export const metadata = {
  title: "Admin",
};

export default function AdminPage() {
  const cards = [
    { href: "/admin/activity", title: "Activity logs", desc: "Search and filter audit events." },
    { href: "/admin/staff", title: "Staff users", desc: "Administrators, lecturers, examiners." },
    { href: "/admin/programmes", title: "Programmes", desc: "Names, short codes, active flag." },
    { href: "/project-settings", title: "Project settings", desc: "Organisation roles and student project configuration." },
    { href: "/project-settings/roles", title: "Project roles", desc: "CRUD organisation roles used in student workspaces." },
    {
      href: "/admin/staff/new",
      title: "Add staff",
      desc: "Invite lecturer, examiner, or system admin with a welcome email.",
    },
    { href: "/students/manage", title: "All students", desc: "Search, filter, edit student records." },
    { href: "/students/new", title: "Add student", desc: "MUBS student email and programme." },
  ];
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        hero
        title="Administration"
        description="Your active role is system admin. Use the shortcuts below to manage users and programmes."
      />
      <ul className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className={`block ${BRAND_CARD_CLASS} border-t-brand-blue p-4 transition hover:border-primary/40 hover:shadow-md`}
            >
              <h2 className="font-semibold text-foreground">{c.title}</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{c.desc}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
