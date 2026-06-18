import { APP_NAME, ORG_NAME } from "@/lib/appConfig";
import {
  BRAND_CARD_CLASS,
  BRAND_HERO_CARD_CLASS,
  BRAND_PAGE_LEAD_CLASS,
  BRAND_SECTION_TITLE_CLASS,
} from "@/lib/brand-ui";

export const metadata = {
  title: "Home",
  description: `Dashboard home for ${APP_NAME}.`,
};

export default function DashboardHomePage() {
  return (
    <div className="w-full space-y-6">
      <section className={BRAND_HERO_CARD_CLASS}>
        <h1 className="text-2xl font-semibold text-foreground">Welcome to {APP_NAME}</h1>
        <p className={`mt-2 max-w-2xl ${BRAND_PAGE_LEAD_CLASS}`}>
          This is your home dashboard. Use the sidebar to move between sections as modules are
          added. The layout follows the Materio-inspired shell with {ORG_NAME} branding.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={`${BRAND_CARD_CLASS} p-5`}>
          <h2 className={BRAND_SECTION_TITLE_CLASS}>Next up</h2>
          <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
            Authentication, Prisma models, and course modules plug into this area without changing
            the shell.
          </p>
        </section>
        <section className={`${BRAND_CARD_CLASS} border-t-brand-yellow p-5`}>
          <h2 className={BRAND_SECTION_TITLE_CLASS}>Low bandwidth</h2>
          <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>
            This shell uses lightweight markup first. Heavy editors and charts load only on routes
            that need them.
          </p>
        </section>
      </div>
    </div>
  );
}
