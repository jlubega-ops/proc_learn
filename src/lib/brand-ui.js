/**
 * Shared Tailwind class strings for Proc Learn / MUBS branding.
 * Prefer CSS variables from `globals.css` so light/dark stay aligned.
 */

/** Three-stripe accent (blue · yellow · red) — sidebar header, cards, auth. */
export const BRAND_TRICOLOR_STRIPE_CLASS = "brand-tricolor-stripe";

export const BRAND_PAGE_SHELL_CLASS = "w-full space-y-4";

export const BRAND_PAGE_TITLE_CLASS =
  "text-lg font-semibold text-foreground sm:text-xl";

export const BRAND_PAGE_LEAD_CLASS =
  "text-sm leading-relaxed text-zinc-600 dark:text-zinc-400";

export const BRAND_SECTION_TITLE_CLASS = "text-sm font-semibold text-primary";

/** Elevated card on dashboard surfaces. */
export const BRAND_CARD_CLASS =
  "rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] shadow-sm";

/** Card with organisation red top accent. */
export const BRAND_CARD_ACCENT_CLASS = `${BRAND_CARD_CLASS} border-t-[3px] border-t-brand-red`;

export const BRAND_HERO_CARD_CLASS =
  "rounded-2xl border border-[color:var(--border-subtle)] border-t-[3px] border-t-brand-blue bg-[color:var(--surface-elevated)] p-5 shadow-sm md:p-8";

/** Active sidebar / tab link. */
export const BRAND_NAV_ACTIVE_CLASS =
  "bg-[color:var(--nav-active-bg)] font-medium text-[color:var(--nav-active-text)] shadow-[inset_3px_0_0_0_var(--brand-yellow)]";

/** Inactive sidebar / tab link. */
export const BRAND_NAV_INACTIVE_CLASS =
  "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800/80";

/** Primary CTA (Tailwind pages without MUI). */
export const BRAND_BTN_PRIMARY_CLASS =
  "inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[color:var(--brand-blue-dark)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** MUI IconButton tint for nav / sidebar icons. */
export const brandIconSx = { fontSize: 22, color: "var(--brand-blue)" };
