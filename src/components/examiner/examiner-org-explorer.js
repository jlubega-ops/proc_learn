"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import LinearProgress from "@mui/material/LinearProgress";
import ListSubheader from "@mui/material/ListSubheader";
import MenuItem from "@mui/material/MenuItem";
import Pagination from "@mui/material/Pagination";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import DashboardRounded from "@mui/icons-material/DashboardRounded";
import CalendarMonthRounded from "@mui/icons-material/CalendarMonthRounded";
import DateRangeRounded from "@mui/icons-material/DateRangeRounded";
import AccountBalanceWalletRounded from "@mui/icons-material/AccountBalanceWalletRounded";
import EventNoteRounded from "@mui/icons-material/EventNoteRounded";
import PeopleRounded from "@mui/icons-material/PeopleRounded";
import GroupsRounded from "@mui/icons-material/GroupsRounded";
import ApartmentRounded from "@mui/icons-material/ApartmentRounded";
import AccountTreeRounded from "@mui/icons-material/AccountTreeRounded";
import SettingsSuggestRounded from "@mui/icons-material/SettingsSuggestRounded";
import StorefrontRounded from "@mui/icons-material/StorefrontRounded";
import ShoppingCartRounded from "@mui/icons-material/ShoppingCartRounded";
import AssignmentRounded from "@mui/icons-material/AssignmentRounded";
import RequestQuoteRounded from "@mui/icons-material/RequestQuoteRounded";
import FactCheckRounded from "@mui/icons-material/FactCheckRounded";
import EmojiEventsRounded from "@mui/icons-material/EmojiEventsRounded";
import ReceiptLongRounded from "@mui/icons-material/ReceiptLongRounded";
import DescriptionRounded from "@mui/icons-material/DescriptionRounded";
import LocalShippingRounded from "@mui/icons-material/LocalShippingRounded";
import ReceiptRounded from "@mui/icons-material/ReceiptRounded";
import PaymentsRounded from "@mui/icons-material/PaymentsRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import HourglassTopRounded from "@mui/icons-material/HourglassTopRounded";
import {
  BRAND_CARD_CLASS,
  BRAND_HERO_CARD_CLASS,
  BRAND_NAV_ACTIVE_CLASS,
  BRAND_NAV_INACTIVE_CLASS,
  BRAND_PAGE_SHELL_CLASS,
  BRAND_SECTION_TITLE_CLASS,
} from "@/lib/brand-ui";
import { adminCenteredLoadingBoxSx, adminLoadingSpinnerSx, themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";
import {
  EXPLORER_SECTION_GROUPS,
  EXPLORER_SECTION_KEYS,
  explorerSectionLabel,
} from "@/lib/academic/examiner-org-explorer-sections";
import { ExplorerItemCard, fmtDate, fmtDateTime } from "@/components/examiner/examiner-explorer-parts";
import { ExaminerExplorerProcurement } from "@/components/examiner/examiner-explorer-procurement";

/** @type {Record<string, import("react").ComponentType<any>>} */
const SECTION_ICONS = {
  overview: DashboardRounded,
  "financial-years": CalendarMonthRounded,
  "planning-periods": DateRangeRounded,
  budgets: AccountBalanceWalletRounded,
  plans: EventNoteRounded,
  users: PeopleRounded,
  committees: GroupsRounded,
  departments: ApartmentRounded,
  structure: AccountTreeRounded,
  processes: SettingsSuggestRounded,
  providers: StorefrontRounded,
  procurements: ShoppingCartRounded,
  requisitions: AssignmentRounded,
  sourcing: RequestQuoteRounded,
  evaluations: FactCheckRounded,
  awards: EmojiEventsRounded,
  "purchase-instructions": ReceiptLongRounded,
  orders: DescriptionRounded,
  deliveries: LocalShippingRounded,
  invoices: ReceiptRounded,
  payments: PaymentsRounded,
  closures: LockRounded,
};

const PAGE_SIZE = 10;

/** @param {string | null | undefined} name */
function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter((w) => w && /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/**
 * Read-only explorer of a student's personal organisation for examiners / lecturers.
 * @param {{ studentId: string; backHref?: string }} props
 */
export function ExaminerOrgExplorer({ studentId, backHref = "/academic/participation" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const rawSection = searchParams.get("section") || "overview";
  const section = EXPLORER_SECTION_KEYS.includes(rawSection) ? rawSection : "overview";
  const procurementId = searchParams.get("procurement") || "";

  const [overview, setOverview] = useState(/** @type {any} */ (null));
  const [overviewLoading, setOverviewLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await fetch(
        `/api/examiner/observation/students/${encodeURIComponent(studentId)}?view=explorer`,
        { credentials: "include" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof json.error === "string" ? json.error : "Could not load this student.",
          severity: "error",
        });
        setOverview(null);
        return;
      }
      setOverview(json);
    } finally {
      setOverviewLoading(false);
    }
  }, [studentId, showToast]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  /** @param {{ section?: string; procurement?: string | null }} next */
  const navigate = useCallback(
    (next) => {
      const qs = new URLSearchParams();
      const s = next.section ?? section;
      if (s && s !== "overview") qs.set("section", s);
      if (next.procurement) qs.set("procurement", next.procurement);
      const query = qs.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, section],
  );

  const [refreshKey, setRefreshKey] = useState(0);

  if (overviewLoading && !overview) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
        <CircularProgress sx={adminLoadingSpinnerSx} />
        <Typography sx={{ mt: 2 }}>Opening organisation…</Typography>
      </Box>
    );
  }

  if (!overview) {
    return (
      <div className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <Button component={Link} href={backHref} startIcon={<ArrowBackRounded />} className="cursor-pointer">
          Back to participation
        </Button>
        <p className="mt-2 text-sm text-zinc-500">This student could not be loaded.</p>
      </div>
    );
  }

  const org = overview.organisation;
  const counts = overview.counts || {};

  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button component={Link} href={backHref} startIcon={<ArrowBackRounded />} className="cursor-pointer">
          Back to participation
        </Button>
        <Button
          type="button"
          variant="outlined"
          onClick={() => {
            setRefreshKey((k) => k + 1);
            void loadOverview();
          }}
          disabled={overviewLoading}
          startIcon={overviewLoading ? <CircularProgress size={14} color="inherit" /> : <RefreshRounded />}
          className="cursor-pointer disabled:cursor-not-allowed"
        >
          Refresh
        </Button>
      </div>

      <ExplorerHero data={overview} />

      {!org ? (
        <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
          <p className="text-sm text-zinc-500">No organisation yet.</p>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
          <ExplorerNav section={section} counts={counts} onSelect={(key) => navigate({ section: key, procurement: null })} />
          <main className="min-w-0" aria-live="polite">
            {procurementId ? (
              <ExaminerExplorerProcurement
                key={`${procurementId}-${refreshKey}`}
                studentId={studentId}
                procurementId={procurementId}
                onBack={() => navigate({ section: section === "overview" ? "procurements" : section, procurement: null })}
              />
            ) : section === "overview" ? (
              <ExplorerOverview data={overview} counts={counts} onSelect={(key) => navigate({ section: key })} />
            ) : (
              <ExplorerSection
                key={`${section}-${refreshKey}`}
                studentId={studentId}
                section={section}
                onOpenProcurement={(id) => navigate({ procurement: id })}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

/**
 * Organisation + student summary card.
 * @param {{ data: any }} props
 */
function ExplorerHero({ data }) {
  const s = data.student;
  const org = data.organisation;
  const summary = data.progress?.summary || null;
  const enrollmentYear = data.academic?.enrollment?.academicYear?.label || data.academic?.currentUniversityYear?.label || null;
  const orgName = org?.displayName || org?.name || `${s.displayName} Organisation`;

  const details = [
    ["Student", s.displayName],
    ["Email", s.email],
    ["Student no.", s.studentNumber],
    ["Reg. no.", s.registrationNumber],
    ["Programme", s.programmeShortName || s.programmeName],
    ["Year of study", s.yearOfStudy ? `Year ${s.yearOfStudy}` : null],
    ["Campus", s.campusLabel],
    ["Academic year", enrollmentYear],
    ["Last sign-in", s.lastLoginAt ? fmtDateTime(s.lastLoginAt) : "Never"],
    ["Organisation created", org?.createdAt ? fmtDate(org.createdAt) : null],
  ].filter(([, v]) => v);

  return (
    <section className={BRAND_HERO_CARD_CLASS} aria-label="Organisation and student">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-white sm:h-14 sm:w-14 sm:text-xl"
            aria-hidden
          >
            {initials(orgName) || "O"}
          </span>
          <div className="min-w-0">
            <h1 className="break-words text-lg font-bold text-foreground sm:text-2xl">{orgName}</h1>
            {org?.displayName && org.name && org.displayName !== org.name ? (
              <p className="text-xs text-zinc-500">Default name: {org.name}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {org?.projectCode ? <Chip size="small" variant="outlined" color="primary" label={org.projectCode} /> : null}
              <Chip size="small" color="info" label="Read-only" />
              {data.demo?.badge ? (
                <Chip size="small" color="warning" label={data.demo.badge.label} />
              ) : (
                <Chip size="small" color="primary" variant="outlined" label="Student" />
              )}
              {summary?.currentStageLabel ? (
                <Chip size="small" color="primary" label={`Now: ${summary.currentStageLabel}`} />
              ) : null}
            </div>
          </div>
        </div>
        {summary ? (
          <div className="w-full shrink-0 md:w-56">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold text-foreground">Progress</span>
              <span className="tabular-nums text-primary">{summary.percent ?? 0}%</span>
            </div>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, Math.max(0, Number(summary.percent) || 0))}
              sx={{ mt: 1, height: 8, borderRadius: 4 }}
              aria-label="Procurement progress"
            />
            <p className="mt-1 text-xs text-zinc-500">
              {summary.completedCount ?? 0}/{summary.totalCount ?? 0} stages complete
            </p>
          </div>
        ) : null}
      </div>
      <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-[color:var(--border-subtle)] pt-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
        {details.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-zinc-500">{label}</dt>
            <dd className="break-words font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Sidebar on large screens; a section picker on small screens.
 * @param {{ section: string; counts: Record<string, number>; onSelect: (key: string) => void }} props
 */
function ExplorerNav({ section, counts, onSelect }) {
  return (
    <>
      <div className="lg:hidden">
        <TextField
          select
          fullWidth
          label="Section"
          value={section}
          onChange={(e) => onSelect(e.target.value)}
          sx={themedTextFieldSx}
        >
          {EXPLORER_SECTION_GROUPS.flatMap((g) => [
            <ListSubheader key={`h-${g.key}`}>{g.label}</ListSubheader>,
            ...g.items.map((it) => (
              <MenuItem key={it.key} value={it.key}>
                {it.label}
                {counts[it.key] != null && it.key !== "overview" ? ` (${counts[it.key]})` : ""}
              </MenuItem>
            )),
          ])}
        </TextField>
      </div>
      <nav
        aria-label="Organisation sections"
        className={`${BRAND_CARD_CLASS} hidden self-start p-2 lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto`}
      >
        {EXPLORER_SECTION_GROUPS.map((g) => (
          <div key={g.key} className="mb-2 last:mb-0">
            <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const Icon = SECTION_ICONS[it.key] || DashboardRounded;
                const active = it.key === section;
                const count = counts[it.key];
                return (
                  <li key={it.key}>
                    <button
                      type="button"
                      onClick={() => onSelect(it.key)}
                      aria-current={active ? "page" : undefined}
                      className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition ${
                        active ? BRAND_NAV_ACTIVE_CLASS : BRAND_NAV_INACTIVE_CLASS
                      }`}
                    >
                      <Icon sx={{ fontSize: 18, color: active ? "var(--brand-blue)" : undefined }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                      {count != null && it.key !== "overview" ? (
                        <span
                          className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                            count ? "bg-[color:var(--nav-active-bg)] text-primary" : "text-zinc-400"
                          }`}
                        >
                          {count}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}

/**
 * Overview: procurement path, live tasks and section tiles.
 * @param {{ data: any; counts: Record<string, number>; onSelect: (key: string) => void }} props
 */
function ExplorerOverview({ data, counts, onSelect }) {
  const stages = data.progress?.stages || [];
  const live = data.liveTasks || [];
  return (
    <div className="space-y-4">
      <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Procurement path</h2>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {stages.map((st) => (
            <li
              key={st.key}
              className={`rounded-lg border px-3 py-2 text-sm ${
                st.state === "current"
                  ? "border-primary bg-[color:var(--nav-active-bg)]"
                  : "border-[color:var(--border-subtle)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{st.label}</span>
                <Chip
                  size="small"
                  color={st.state === "done" ? "success" : st.state === "current" ? "info" : "warning"}
                  variant={st.state === "todo" ? "outlined" : "filled"}
                  label={st.state === "done" ? "Done" : st.state === "current" ? "Current" : "To do"}
                />
              </div>
              {st.responsibleActor || st.occurredAt ? (
                <p className="mt-1 text-xs text-zinc-500">
                  {[st.responsibleActor, st.occurredAt ? fmtDate(st.occurredAt) : null].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              {st.state === "current" && st.currentAction ? (
                <p className="mt-1 text-xs text-foreground">Now: {st.currentAction}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Waiting now</h2>
        {!live.length ? (
          <p className="mt-2 text-sm text-zinc-500">No open tasks.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {live.map((t) => (
              <li key={t.id} className="flex items-start gap-2 rounded-lg border border-[color:var(--border-subtle)] px-3 py-2 text-sm">
                <HourglassTopRounded sx={{ fontSize: 18, mt: "2px", color: "var(--brand-blue)" }} aria-hidden />
                <div className="min-w-0">
                  <p className="break-words font-medium text-foreground">{t.title}</p>
                  <p className="text-xs text-zinc-500">
                    {[t.role, t.assignee].filter(Boolean).join(" · ") || "Unassigned"} · since {fmtDate(t.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Organisation at a glance</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {EXPLORER_SECTION_GROUPS.flatMap((g) => g.items)
            .filter((it) => it.key !== "overview")
            .map((it) => {
              const Icon = SECTION_ICONS[it.key] || DashboardRounded;
              return (
                <Tooltip key={it.key} title={`Open ${it.label.toLowerCase()}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(it.key)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-[color:var(--border-subtle)] px-3 py-2 text-left transition hover:border-primary hover:bg-[color:var(--nav-active-bg)]"
                  >
                    <Icon sx={{ fontSize: 20, color: "var(--brand-blue)" }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-bold leading-tight text-foreground tabular-nums">
                        {counts[it.key] ?? 0}
                      </span>
                      <span className="block truncate text-xs text-zinc-500">{it.label}</span>
                    </span>
                  </button>
                </Tooltip>
              );
            })}
        </div>
      </section>
    </div>
  );
}

/**
 * One section: searchable, paginated item cards with inline history.
 * @param {{ studentId: string; section: string; onOpenProcurement: (id: string) => void }} props
 */
function ExplorerSection({ studentId, section, onOpenProcurement }) {
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(/** @type {any} */ (null));
  const cache = useRef(/** @type {Map<string, any>} */ (new Map()));

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const key = `${page}|${search}`;
    const hit = cache.current.get(key);
    if (hit) {
      setData(hit);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
        if (search) qs.set("q", search);
        const res = await fetch(
          `/api/examiner/observation/students/${encodeURIComponent(studentId)}/org/${encodeURIComponent(section)}?${qs}`,
          { credentials: "include" },
        );
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          showToast({
            message: typeof json.error === "string" ? json.error : "Could not load this section.",
            severity: "error",
          });
          setData(null);
          return;
        }
        cache.current.set(key, json);
        setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, section, page, search, showToast]);

  const label = explorerSectionLabel(section);
  const Icon = SECTION_ICONS[section] || DashboardRounded;
  const isTree = section === "structure";
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className={`${BRAND_CARD_CLASS} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}>
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Icon sx={{ fontSize: 22, color: "var(--brand-blue)" }} aria-hidden />
          {label}
          {!isTree && data ? <span className="text-sm font-normal text-zinc-500">({total})</span> : null}
          {loading && data ? <CircularProgress size={14} aria-label="Loading" /> : null}
        </h2>
        {!isTree ? (
          <TextField
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            aria-label={`Search ${label.toLowerCase()}`}
            sx={{ ...themedTextFieldSx, width: { xs: "100%", sm: 240 } }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRounded fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
        ) : null}
      </div>

      {loading && !data ? (
        <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
          <CircularProgress sx={adminLoadingSpinnerSx} />
          <Typography sx={{ mt: 2 }}>Loading {label.toLowerCase()}…</Typography>
        </Box>
      ) : !data ? null : isTree ? (
        <StructureTree units={data.tree || []} />
      ) : !data.items?.length ? (
        <div className={`${BRAND_CARD_CLASS} p-6 text-center text-sm text-zinc-500`}>
          {search ? "No matches." : `No ${label.toLowerCase()} yet.`}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {data.items.map((item) => (
              <ExplorerItemCard key={item.id} item={item} onOpenProcurement={onOpenProcurement} />
            ))}
          </div>
          {pages > 1 ? (
            <div className="flex justify-center pt-1">
              <Pagination
                count={pages}
                page={page}
                onChange={(_e, next) => setPage(next)}
                color="primary"
                siblingCount={0}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Units nested under their parents, with the users placed in each.
 * @param {{ units: any[] }} props
 */
function StructureTree({ units }) {
  if (!units.length) {
    return <div className={`${BRAND_CARD_CLASS} p-6 text-center text-sm text-zinc-500`}>No units yet.</div>;
  }
  const ids = new Set(units.map((u) => u.id));
  /** @type {Map<string | null, any[]>} */
  const children = new Map();
  for (const u of units) {
    const parent = u.parentId && ids.has(u.parentId) ? u.parentId : null;
    const list = children.get(parent) || [];
    list.push(u);
    children.set(parent, list);
  }

  /** @param {string | null} parentId @param {number} depth */
  const renderLevel = (parentId, depth) => {
    const list = children.get(parentId) || [];
    if (!list.length) return null;
    return (
      <ul className={depth ? "ml-3 mt-2 space-y-2 border-l-2 border-[color:var(--border-subtle)] pl-3 sm:ml-5 sm:pl-4" : "space-y-2"}>
        {list.map((u) => (
          <li key={u.id}>
            <div className="rounded-lg border border-[color:var(--border-subtle)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <AccountTreeRounded sx={{ fontSize: 18, color: "var(--brand-blue)" }} aria-hidden />
                <span className="font-semibold text-foreground">{u.name}</span>
                {u.code ? <span className="text-xs text-primary">{u.code}</span> : null}
                <Chip size="small" variant="outlined" label={u.unitType} />
                {!u.isActive ? <Chip size="small" color="warning" variant="outlined" label="Inactive" /> : null}
              </div>
              {u.users.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {u.users.map((p, i) => (
                    <Chip key={i} size="small" color="primary" variant="outlined" label={p.role ? `${p.name} · ${p.role}` : p.name} />
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-zinc-500">No users.</p>
              )}
            </div>
            {renderLevel(u.id, depth + 1)}
          </li>
        ))}
      </ul>
    );
  };

  return <div className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>{renderLevel(null, 0)}</div>;
}
