import { APP_NAME, ORG_NAME } from "@/lib/appConfig";

export const metadata = {
  title: "Home",
  description: `Dashboard home for ${APP_NAME}.`,
};

export default function DashboardHomePage() {
  return (
    <div className="w-full space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:p-8">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">
          Welcome to {APP_NAME}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          This is your home dashboard. Use the sidebar to move between sections
          as we add modules. The layout follows the Materio-inspired shell with{" "}
          {ORG_NAME} branding.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-[#008bd0]">Next up</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Authentication, Prisma models, and course modules will plug into this
            area without changing the shell.
          </p>
        </section>
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-[#008bd0]">Low bandwidth</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            This shell uses lightweight markup first. Heavy editors and charts
            load only on routes that need them.
          </p>
        </section>
      </div>
    </div>
  );
}
