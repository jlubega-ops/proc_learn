import Image from "next/image";
import { redirect } from "next/navigation";
import { BrandedPublicShell } from "@/components/auth/branded-public-shell";
import { MaintenanceStatusWatcher } from "@/components/site/maintenance-status-watcher";
import { APP_NAME } from "@/lib/appConfig";
import { readSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Under maintenance",
  description: `${APP_NAME} is under maintenance.`,
  robots: { index: false },
};

export default async function MaintenancePage() {
  const settings = await readSiteSettings({ fresh: true });
  if (!settings.maintenanceEnabled) redirect("/");

  return (
    <BrandedPublicShell className="h-dvh">
      <main className="w-full max-w-lg shrink-0" aria-labelledby="maintenance-title">
        <div className="overflow-hidden rounded-2xl border border-white/65 bg-white/95 shadow-2xl backdrop-blur-md">
          <div className="brand-tricolor-stripe" aria-hidden />
          <div className="flex items-center justify-center gap-2 bg-brand-yellow px-4 py-2 text-center text-xs font-bold uppercase tracking-[0.18em] text-zinc-900">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-red" aria-hidden />
            Site under maintenance
          </div>

          <div className="px-6 py-7 text-center sm:px-8 sm:py-8">
            <div className="mx-auto flex items-center justify-center gap-3">
              <Image src="/assets/mubs.png" alt="MUBS" width={48} height={48} className="object-contain" priority />
              <div className="text-left">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Makerere University Business School
                </p>
                <p className="text-2xl font-extrabold tracking-tight text-primary">{APP_NAME}</p>
              </div>
            </div>

            <h1 id="maintenance-title" className="mt-7 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              We&apos;ll be back soon
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-zinc-600">
              We&apos;re making improvements to {APP_NAME}. Sorry for the inconvenience — please check back
              shortly.
            </p>

            <MaintenanceStatusWatcher />
          </div>
        </div>
      </main>
    </BrandedPublicShell>
  );
}
