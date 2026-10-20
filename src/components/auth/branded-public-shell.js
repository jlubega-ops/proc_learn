import { BrandLogoImage, BrandBackgroundImage } from "@/components/providers/site-branding-provider";

/**
 * Full-viewport MUBS-branded backdrop (matches sign-in). Use with {@link BrandedAuthCard}.
 * @param {{ children: import("react").ReactNode; className?: string }} props
 */
export function BrandedPublicShell({ children, className = "" }) {
  return (
    <div
      className={`relative flex min-h-dvh min-h-0 flex-col overflow-hidden ${className}`.trim()}
    >
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <div className="relative h-full w-full min-h-dvh">
          <BrandBackgroundImage
            alt=""
            fill
            priority
            quality={45}
            className="scale-[1.02] object-cover blur-[2px]"
            sizes="100vw"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/12 to-black/35" />
        <div
          className="absolute inset-0 opacity-35 mix-blend-overlay"
          style={{
            background:
              "linear-gradient(135deg, rgba(0,139,208,0.28) 0%, transparent 40%, rgba(255,242,0,0.12) 55%, transparent 70%, rgba(237,28,36,0.18) 100%)",
          }}
          aria-hidden
        />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-y-auto overflow-x-hidden p-3 py-8 sm:p-4 sm:py-10">
        {children}
      </div>
    </div>
  );
}

/**
 * White glass card with MUBS red top accent (aligned with sign-in card).
 * @param {{
 *   title: string;
 *   subtitle?: string;
 *   children: import("react").ReactNode;
 *   maxWidthClass?: string;
 * }} props
 */
export function BrandedAuthCard({ title, subtitle, children, maxWidthClass = "max-w-md" }) {
  return (
    <div className={`w-full ${maxWidthClass} shrink-0`}>
      <div className="flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-white/65 bg-white/95 shadow-2xl backdrop-blur-md dark:border-zinc-600/80 dark:bg-zinc-900/95">
        <div className="brand-tricolor-stripe" aria-hidden />
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <div className="mb-1 flex items-center gap-3">
            <div className="relative h-11 w-11 shrink-0 sm:h-12 sm:w-12">
              <BrandLogoImage
                alt="MUBS"
                width={48}
                height={48}
                className="object-contain"
                priority
              />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                Makerere University Business School
              </p>
              <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white sm:text-xl">
                {title}
              </h1>
            </div>
          </div>
          {subtitle ? (
            <p className="mt-2 text-sm leading-snug text-zinc-600 dark:text-zinc-300">{subtitle}</p>
          ) : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
