/**
 * Single canonical width for signed-in **main** + **footer** content so pages
 * align edge-to-edge in one column (no mixed `max-w-5xl` / `max-w-2xl` shells).
 *
 * Tailwind: `max-w-6xl` = 72rem (1152px). Pages should use `w-full` inside this
 * unless a **deliberate** narrow form (e.g. `max-w-md` inside a full-width card).
 */
export const DASHBOARD_MAIN_INNER_CLASS = "mx-auto w-full max-w-6xl";
