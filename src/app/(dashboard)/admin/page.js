import Link from "next/link";

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
    <div className="w-full space-y-6">
      <div className="rounded-2xl border border-dashed border-amber-300/80 bg-amber-50/80 p-6 dark:border-amber-700/60 dark:bg-amber-950/30">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">
          Administration
        </h1>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          Your active role is system admin. Use the shortcuts below to manage users and
          programmes.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-[#008bd0]/40 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h2 className="font-semibold text-zinc-900 dark:text-white">{c.title}</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{c.desc}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
