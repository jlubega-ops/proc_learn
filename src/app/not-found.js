import Link from "next/link";
import { BrandedAuthCard, BrandedPublicShell } from "@/components/auth/branded-public-shell";
import { APP_NAME } from "@/lib/appConfig";

export default function NotFound() {
  return (
    <BrandedPublicShell>
      <BrandedAuthCard
        title="Page not found"
        subtitle={`We could not find that page on ${APP_NAME}. The link may be outdated or the page may have moved.`}
        maxWidthClass="max-w-lg"
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Error code: <span className="font-mono font-semibold text-[#008bd0]">404</span>
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-[#008bd0] px-5 text-sm font-semibold text-white shadow hover:bg-[#0076b0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008bd0]"
          >
            Back to home
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            Sign in
          </Link>
        </div>
      </BrandedAuthCard>
    </BrandedPublicShell>
  );
}
