import Link from "next/link";
import ApartmentRounded from "@mui/icons-material/ApartmentRounded";
import AssignmentRounded from "@mui/icons-material/AssignmentRounded";
import EditNoteRounded from "@mui/icons-material/EditNoteRounded";
import EventNoteRounded from "@mui/icons-material/EventNoteRounded";
import GroupsRounded from "@mui/icons-material/GroupsRounded";
import Groups2Rounded from "@mui/icons-material/Groups2Rounded";
import InventoryRounded from "@mui/icons-material/InventoryRounded";
import RequestQuoteRounded from "@mui/icons-material/RequestQuoteRounded";
import ShoppingCartRounded from "@mui/icons-material/ShoppingCartRounded";
import StorefrontRounded from "@mui/icons-material/StorefrontRounded";
import TuneRounded from "@mui/icons-material/TuneRounded";
import { RecordDetailsGrid } from "@/components/projects/record-details-grid";
import { BRAND_CARD_CLASS, BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";

const ICONS = {
  departments: ApartmentRounded,
  users: GroupsRounded,
  committees: Groups2Rounded,
  providers: StorefrontRounded,
  budgets: RequestQuoteRounded,
  procurementPlans: EventNoteRounded,
  requisitions: AssignmentRounded,
  procurements: ShoppingCartRounded,
};

/**
 * @param {{ items: { key: string; label: string; value: number; hint?: string }[]; links?: Record<string, string> }} p
 */
function StatTiles({ items, links = {} }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
      {items.map((item) => {
        const Icon = ICONS[item.key] || InventoryRounded;
        const href = links[item.key];
        const body = (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {item.label}
              </span>
              <Icon sx={{ fontSize: 20, color: "var(--brand-blue)" }} aria-hidden />
            </div>
            <div className="mt-1 text-2xl font-bold text-foreground">{item.value}</div>
            {item.hint ? (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">{item.hint}</div>
            ) : null}
          </>
        );
        const tileClass =
          "block min-w-0 rounded-xl border border-[color:var(--border-subtle)] p-3 transition";
        return href ? (
          <Link
            key={item.key}
            href={href}
            title={`Open ${item.label}`}
            className={`${tileClass} cursor-pointer hover:border-primary hover:bg-[color:var(--nav-active-bg)]`}
          >
            {body}
          </Link>
        ) : (
          <div key={item.key} className={tileClass}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Full organisation profile for dashboards.
 * @param {{
 *   profile: NonNullable<Awaited<ReturnType<typeof import("@/lib/projects/org-profile").loadOrgProfile>>>;
 *   settingsHref?: string | null;
 *   links?: Record<string, string>;
 * }} props
 */
export function OrgProfileView({ profile, settingsHref = null, links = {} }) {
  return (
    <>
      <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`} aria-labelledby="org-profile-identity">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="org-profile-identity" className={BRAND_SECTION_TITLE_CLASS}>
            Organisation details
          </h2>
          {settingsHref ? (
            <Link
              href={settingsHref}
              title="Edit organisation settings"
              className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              <TuneRounded sx={{ fontSize: 18 }} aria-hidden />
              Settings
            </Link>
          ) : null}
        </div>
        <RecordDetailsGrid fields={profile.identity} />
      </section>

      <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`} aria-labelledby="org-profile-calendar">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="org-profile-calendar" className={BRAND_SECTION_TITLE_CLASS}>
            Financial calendar
          </h2>
          {links.financialYears ? (
            <Link
              href={links.financialYears}
              title="Manage financial years"
              className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              <EditNoteRounded sx={{ fontSize: 18 }} aria-hidden />
              Manage
            </Link>
          ) : null}
        </div>
        <RecordDetailsGrid fields={profile.calendar} />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`} aria-labelledby="org-profile-structure">
          <h2 id="org-profile-structure" className={BRAND_SECTION_TITLE_CLASS}>
            Structure
          </h2>
          <StatTiles items={profile.structure} links={links} />
        </section>
        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`} aria-labelledby="org-profile-activity">
          <h2 id="org-profile-activity" className={BRAND_SECTION_TITLE_CLASS}>
            Procurement activity
          </h2>
          <StatTiles items={profile.activity} links={links} />
        </section>
      </div>
    </>
  );
}

/**
 * Admin links into the org-admin pages for a workspace base (`/organisation` or `/projects/{id}`).
 * @param {string} base
 */
export function orgProfileAdminLinks(base) {
  return {
    departments: `${base}/org-admin/departments`,
    users: `${base}/org-admin/users`,
    committees: `${base}/org-admin/committees`,
    providers: `${base}/org-admin/providers`,
    budgets: `${base}/org-admin/budgets`,
    financialYears: `${base}/org-admin/financial-years`,
  };
}
