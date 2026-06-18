import {
  BRAND_CARD_CLASS,
  BRAND_HERO_CARD_CLASS,
  BRAND_PAGE_LEAD_CLASS,
  BRAND_PAGE_SHELL_CLASS,
  BRAND_PAGE_TITLE_CLASS,
} from "@/lib/brand-ui";

/**
 * Standard signed-in page title block.
 * @param {{ title: string; description?: string; hero?: boolean; children?: import("react").ReactNode }} props
 */
export function DashboardPageIntro({ title, description, hero = false, children }) {
  const shell = hero ? BRAND_HERO_CARD_CLASS : `${BRAND_CARD_CLASS} p-4 sm:p-5`;
  return (
    <div className={shell}>
      <h1 className={BRAND_PAGE_TITLE_CLASS}>{title}</h1>
      {description ? <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>{description}</p> : null}
      {children}
    </div>
  );
}

export { BRAND_PAGE_LEAD_CLASS, BRAND_PAGE_SHELL_CLASS } from "@/lib/brand-ui";
