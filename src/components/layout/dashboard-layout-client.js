"use client";

import Link from "next/link";
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Image from "next/image";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import DarkModeRounded from "@mui/icons-material/DarkModeRounded";
import LightModeRounded from "@mui/icons-material/LightModeRounded";
import LoginRounded from "@mui/icons-material/LoginRounded";
import MenuRounded from "@mui/icons-material/MenuRounded";
import { APP_NAME, COPYRIGHT_YEAR, ORG_NAME } from "@/lib/appConfig";
import { useAppTheme } from "@/components/providers/theme-provider";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { sidebarNavForContext } from "@/lib/nav-config";
import { formatRoleLabel } from "@/lib/roles";
import { NavbarUserMenu } from "@/components/layout/navbar-user-menu";
import { NotificationBellMenu } from "@/components/layout/notification-bell-menu";
import { JoinAcademicYearPrompt } from "@/components/academic/join-academic-year-prompt";
import { JoinPracticeProjectPrompt } from "@/components/academic/join-practice-project-prompt";
import { ActiveOrgContextBanner, StudentExitOrgSidebarButton } from "@/components/academic/active-org-context-banner";
import { ActiveCommitteeContextBanner } from "@/components/layout/active-committee-context-banner";
import { StudentModeBanner } from "@/components/academic/student-mode-banner";
import { getDashboardPageMeta } from "@/lib/dashboard-page-meta";
import { DASHBOARD_MAIN_INNER_CLASS } from "@/lib/dashboard-content-width";
import { PROJECT_ORG_ENTRY_ROLE_NAME } from "@/lib/project-org-role";
import {
  BRAND_NAV_ACTIVE_CLASS,
  BRAND_NAV_INACTIVE_CLASS,
  BRAND_TRICOLOR_STRIPE_CLASS,
  brandIconSx,
} from "@/lib/brand-ui";

const primaryIconSx = brandIconSx;
const childNavIconSx = { fontSize: 20, color: "var(--brand-blue)" };
const navFocusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * @param {string} pathname
 */
function projectIdFromPath(pathname) {
  const m = String(pathname || "").match(/^\/projects\/([^/]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : "";
}

function isOrganisationPath(pathname) {
  return String(pathname || "").startsWith("/organisation");
}

/**
 * @param {string} navPathname
 * @param {URLSearchParams} searchParams
 * @param {string} href
 */
function navItemIsActive(navPathname, searchParams, href) {
  const q = href.indexOf("?");
  const base = q === -1 ? href : href.slice(0, q);
  const query = q === -1 ? "" : href.slice(q + 1);

  if (base === "/profile") {
    if (navPathname !== "/profile") return false;
    const wantTab = new URLSearchParams(query).get("tab") || "details";
    const curTab = searchParams.get("tab") || "details";
    return wantTab === curTab;
  }

  if (href === "/admin") {
    return navPathname === "/admin";
  }

  // Organisation home / Overview must not stay active under /organisation/org-admin/*
  if (base === "/organisation" || base === "/organisation/") {
    return navPathname === "/organisation" || navPathname === "/organisation/";
  }

  // Dashboard home is exact-match only
  if (base === "/") {
    return navPathname === "/" || navPathname === "";
  }

  if (navPathname === base) return true;
  if (base !== "/" && navPathname.startsWith(`${base}/`)) return true;
  return false;
}

/**
 * @param {{
 *   label: string;
 *   open: boolean;
 *   onToggle: () => void;
 *   children: import("react").ReactNode;
 * }} p
 */
function CollapsibleNavSection({ label, open, onToggle, children }) {
  return (
    <li className="list-none">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        title={`${open ? "Collapse" : "Expand"} ${label}`}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/80"
      >
        <span className="flex-1">{label}</span>
        <ExpandMoreRounded
          aria-hidden
          sx={{ fontSize: 18 }}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <ul className="mt-0.5 flex flex-col gap-0.5 border-l-2 border-primary/25 pl-2 ml-2">
          {children}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * @param {{ onNavigate: () => void; activeRole: string; searchParams: URLSearchParams; canManageOrgAdmin?: boolean }} p
 */
function NavLinks({
  onNavigate,
  activeRole,
  searchParams,
  canManageOrgAdmin = false,
  sessionType = "platform",
  orgProjectId = "",
  orgPermissions = [],
  orgRoleName = "",
  activeCommittee = null,
  personalOrgProjectId = "",
  orgContext = "PERSONAL",
}) {
  const navPathname = usePathname();
  const sections = sidebarNavForContext(activeRole, navPathname || "/", {
    canManageOrgAdmin,
    sessionType,
    projectId: orgProjectId,
    permissions: orgPermissions,
    roleName: orgRoleName || null,
    activeCommittee: activeCommittee || null,
    personalOrgProjectId,
    orgContext,
  });

  const childActive = (children) =>
    Array.isArray(children) &&
    children.some((child) => navItemIsActive(navPathname || "/", searchParams, child.href));

  const sectionHasActiveLink = (links) =>
    links.some((item) => {
      if (Array.isArray(item.children) && item.children.length > 0) {
        return childActive(item.children);
      }
      return navItemIsActive(navPathname || "/", searchParams, item.href);
    });

  const defaultOpenSectionIds = useMemo(
    () => sections.filter((section) => section.defaultOpen).map((section) => section.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sections identity follows role/context
    [activeRole, canManageOrgAdmin, sessionType, orgProjectId, personalOrgProjectId, orgContext],
  );

  const activeSectionId = useMemo(
    () => sections.find((section) => sectionHasActiveLink(section.links))?.id ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pathname/searchParams drive active section
    [navPathname, searchParams, activeRole, canManageOrgAdmin, sessionType, orgProjectId, personalOrgProjectId, orgContext],
  );

  const contextKey = `${activeRole}|${sessionType}|${orgProjectId}|${canManageOrgAdmin}|${personalOrgProjectId}|${orgContext}`;
  const lastContextKey = useRef("");

  /** Accordion: at most one collapsible section open; expanding one closes the others. */
  const [openSectionId, setOpenSectionId] = useState(/** @type {string | null} */ (null));

  const isCollapsibleSection = (sectionId) =>
    sections.some((section) => section.id === sectionId && section.collapsible);

  useEffect(() => {
    const contextChanged = lastContextKey.current !== contextKey;
    lastContextKey.current = contextKey;

    setOpenSectionId((prev) => {
      const activeCollapsible =
        activeSectionId && isCollapsibleSection(activeSectionId) ? activeSectionId : null;

      if (contextChanged || prev === null) {
        if (activeCollapsible) return activeCollapsible;
        if (defaultOpenSectionIds.length > 0) return defaultOpenSectionIds[0];
        return null;
      }

      if (activeCollapsible && prev !== activeCollapsible) {
        return activeCollapsible;
      }

      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sections derived from role/context above
  }, [contextKey, activeSectionId, defaultOpenSectionIds]);

  const toggleSection = (sectionId) => {
    setOpenSectionId((prev) => (prev === sectionId ? null : sectionId));
  };

  const renderLink = (section, { href, label, title, Icon, children }) => {
    if (Array.isArray(children) && children.length > 0) {
      const hasActiveChild = childActive(children);
      return (
        <li key={`${section.id}::${label}`} className="list-none">
          <details open={hasActiveChild} className="group rounded-lg">
            <summary
              title={title}
              className={`flex cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                hasActiveChild ? BRAND_NAV_ACTIVE_CLASS : BRAND_NAV_INACTIVE_CLASS
              }`}
            >
              <Icon aria-hidden sx={primaryIconSx} />
              <span className="flex-1">{label}</span>
              <ExpandMoreRounded
                aria-hidden
                sx={{ fontSize: 20 }}
                className="transition-transform group-open:rotate-180"
              />
            </summary>
            <ul className="ml-6 mt-1 flex flex-col gap-1">
              {children.map(({ href: childHref, label: childLabel, title: childTitle, Icon: ChildIcon }) => {
                const active = navItemIsActive(navPathname || "/", searchParams, childHref);
                return (
                  <li key={`${childHref}::${childLabel}`} className="list-none">
                    <Link
                      href={childHref}
                      title={childTitle}
                      aria-current={active ? "page" : undefined}
                      onClick={onNavigate}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                        active ? BRAND_NAV_ACTIVE_CLASS : BRAND_NAV_INACTIVE_CLASS
                      }`}
                    >
                      <ChildIcon aria-hidden sx={childNavIconSx} />
                      {childLabel}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        </li>
      );
    }
    const active = navItemIsActive(navPathname || "/", searchParams, href);
    return (
      <li key={`${href}::${label}`} className="list-none">
        <Link
          href={href}
          title={title}
          aria-current={active ? "page" : undefined}
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${navFocusClass} ${
            active ? BRAND_NAV_ACTIVE_CLASS : BRAND_NAV_INACTIVE_CLASS
          }`}
        >
          <Icon aria-hidden sx={primaryIconSx} />
          {label}
        </Link>
      </li>
    );
  };

  return (
    <ul className="flex flex-col gap-1 p-3">
      {sections.map((section, sectionIndex) => {
        const sectionLinks = section.links.map((link) => renderLink(section, link));

        return (
          <Fragment key={section.id}>
            {sectionIndex > 0 ? (
              <li aria-hidden className="mx-2 my-2 list-none border-t border-zinc-200 dark:border-zinc-700" />
            ) : null}
            {section.label && section.collapsible ? (
              <CollapsibleNavSection
                label={section.label}
                open={openSectionId === section.id}
                onToggle={() => toggleSection(section.id)}
              >
                {sectionLinks}
              </CollapsibleNavSection>
            ) : (
              <>
                {section.label ? (
                  <li className="list-none px-3 pb-1 pt-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {section.label}
                    </span>
                  </li>
                ) : null}
                {sectionLinks}
              </>
            )}
          </Fragment>
        );
      })}
    </ul>
  );
}

function NavLinksWithSearch({
  canManageOrgAdmin,
  sessionType,
  orgProjectId,
  orgPermissions,
  orgRoleName,
  activeCommittee,
  personalOrgProjectId,
  orgContext,
  ...props
}) {
  const searchParams = useSearchParams();
  return (
    <NavLinks
      {...props}
      searchParams={searchParams}
      canManageOrgAdmin={canManageOrgAdmin}
      sessionType={sessionType}
      orgProjectId={orgProjectId}
      orgPermissions={orgPermissions}
      orgRoleName={orgRoleName}
      activeCommittee={activeCommittee}
      personalOrgProjectId={personalOrgProjectId}
      orgContext={orgContext}
    />
  );
}

export default function DashboardLayoutClient({ children }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Layout shell: sidebar + header + main + footer (single root).
  const { mode, toggleMode } = useAppTheme();
  const { session, loading: authLoading } = useAuthSession();
  const activeRole = session?.activeRole ?? "STUDENT";
  const isOrgSession = session?.sessionType === "org";
  const orgProjectId = isOrgSession ? String(session?.projectId || "") : "";
  const orgPermissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const orgRoleName = isOrgSession ? String(session?.orgRoleName || "") : "";
  const personalOrgProjectId = !isOrgSession
    ? String(session?.activeOrgProjectId || session?.personalOrgProjectId || "")
    : "";
  const orgContext = !isOrgSession
    ? String(session?.orgContext || "PERSONAL")
    : "PERSONAL";
  const pathProjectId = isOrgSession ? orgProjectId : projectIdFromPath(pathname || "/");
  const onOrganisation = !isOrgSession && activeRole === "STUDENT" && isOrganisationPath(pathname || "/");
  const projectId = onOrganisation ? personalOrgProjectId : pathProjectId;
  const isStudentOrgWorld = isOrgSession || onOrganisation;
  const [projectOrgLabel, setProjectOrgLabel] = useState("");
  const [canManageOrgAdmin, setCanManageOrgAdmin] = useState(false);
  const [projectOrgLoading, setProjectOrgLoading] = useState(false);

  const authed = Boolean(session?.authenticated);
  const showSidebarSignIn = !authed;
  const pageMeta = getDashboardPageMeta(
    pathname || "/",
    isOrgSession ? "ORG_MEMBER" : activeRole,
  );

  useEffect(() => {
    if (!isStudentOrgWorld || !projectId) {
      setProjectOrgLabel("");
      setCanManageOrgAdmin(false);
      setProjectOrgLoading(false);
      return;
    }

    if (isOrgSession) {
      setProjectOrgLabel(String(session?.projectName || "").trim());
      setCanManageOrgAdmin(false);
      setProjectOrgLoading(false);
      return;
    }

    if (onOrganisation && (session?.activeOrgName || session?.personalOrgName)) {
      setProjectOrgLabel(String(session.activeOrgName || session.personalOrgName).trim());
      setCanManageOrgAdmin(true);
      setProjectOrgLoading(false);
      return;
    }

    let cancelled = false;
    setProjectOrgLoading(true);
    fetch(`/api/projects/${projectId}`, { credentials: "include" })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (cancelled) return;
        const project = data?.project || null;
        const label = String(project?.organizationName || project?.name || "").trim();
        setProjectOrgLabel(label);
        setCanManageOrgAdmin(Boolean(project?.canManageOrgAdmin));
      })
      .finally(() => {
        if (!cancelled) setProjectOrgLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    isStudentOrgWorld,
    projectId,
    isOrgSession,
    onOrganisation,
    session?.projectName,
    session?.personalOrgName,
  ]);

  return (
    <div className="flex min-h-dvh bg-[color:var(--surface-muted)] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[120] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:text-zinc-900 dark:focus:bg-zinc-900 dark:focus:text-white"
      >
        Skip to main content
      </a>

      <div
        className={`fixed inset-0 z-40 bg-black/40 transition md:hidden ${
          drawerOpen ? "visible opacity-100" : "invisible opacity-0"
        }`}
        aria-hidden={!drawerOpen}
        onClick={() => setDrawerOpen(false)}
      />
      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-64 max-w-[85vw] flex-col border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-sidebar)] shadow-xl transition-transform dark:shadow-none md:sticky md:top-0 md:h-screen md:translate-x-0 md:shadow-none ${
          drawerOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        aria-label="Main navigation"
      >
        <div className={BRAND_TRICOLOR_STRIPE_CLASS} aria-hidden />
        <div className="flex shrink-0 items-center gap-3 border-b border-[color:var(--border-subtle)] bg-gradient-to-r from-[color-mix(in_oklab,var(--brand-blue)_6%,var(--surface-sidebar))] to-[color:var(--surface-sidebar)] px-4 py-4">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white">
            <Image
              src="/assets/mubs.png"
              alt={`${ORG_NAME} logo`}
              fill
              sizes="40px"
              className="object-contain"
              priority
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold tracking-tight text-primary">
              {APP_NAME}
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {ORG_NAME}
            </p>
          </div>
        </div>

        <nav
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          aria-label="Sidebar pages"
        >
          <Suspense
            fallback={
              <div className="p-4 text-xs text-zinc-500 dark:text-zinc-400">Loading menu…</div>
            }
          >
            <NavLinksWithSearch
              onNavigate={() => setDrawerOpen(false)}
              activeRole={activeRole}
              canManageOrgAdmin={canManageOrgAdmin}
              sessionType={isOrgSession ? "org" : "platform"}
              orgProjectId={orgProjectId}
              orgPermissions={orgPermissions}
              orgRoleName={orgRoleName}
              activeCommittee={isOrgSession ? session?.activeCommittee || null : null}
              personalOrgProjectId={personalOrgProjectId}
              orgContext={orgContext}
            />
          </Suspense>
        </nav>

        {showSidebarSignIn ? (
          <div className="shrink-0 border-t border-[color:var(--border-subtle)] p-3">
            <Link
              href="/login"
              title="Open the sign-in page"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center justify-center gap-2 rounded-lg border border-[color:var(--border-subtle)] px-3 py-2 text-sm font-medium text-zinc-800 transition hover:border-primary/40 hover:bg-[color:var(--nav-active-bg)] dark:text-zinc-100"
            >
              <LoginRounded aria-hidden sx={primaryIconSx} />
              Sign in
            </Link>
          </div>
        ) : (
          <StudentExitOrgSidebarButton onNavigate={() => setDrawerOpen(false)} />
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)]/90 backdrop-blur-md">
          <div className={BRAND_TRICOLOR_STRIPE_CLASS} aria-hidden />
          <div className="flex h-14 items-center gap-3 px-3 md:px-6">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-primary transition hover:bg-[color:var(--nav-active-bg)] md:hidden"
            title="Open navigation menu"
            aria-controls="app-sidebar"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((o) => !o)}
          >
            <MenuRounded aria-hidden sx={brandIconSx} />
          </button>
          <div className="min-w-0 flex-1">
            {isStudentOrgWorld ? (
              <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold md:text-base">{pageMeta.title}</p>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{pageMeta.subtitle}</p>
                </div>
                <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden />
                <div className="min-w-0">
                  {orgContext === "PRACTICE" || orgContext === "ASSESSMENT" ? (
                    <>
                      <p
                        className={`truncate text-[11px] font-bold uppercase tracking-wide ${
                          orgContext === "ASSESSMENT" ? "text-brand-red" : "text-primary"
                        }`}
                      >
                        {orgContext === "ASSESSMENT"
                          ? "Assessment project organisation"
                          : "Practice project organisation"}
                      </p>
                      <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                        {projectOrgLoading
                          ? "Loading…"
                          : projectOrgLabel || session?.activeOrgName || "Project organisation"}
                      </p>
                      <p className="truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        Not your default My Organisation · Role: {PROJECT_ORG_ENTRY_ROLE_NAME}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="truncate text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Organization workspace
                      </p>
                      <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                        Organization:{" "}
                        {projectOrgLoading ? "Loading…" : projectOrgLabel || "Current organization"}
                      </p>
                      <p className="truncate text-[11px] font-bold uppercase tracking-wide text-primary">
                        Role:{" "}
                        {isOrgSession
                          ? orgRoleName || "Organisation user"
                          : PROJECT_ORG_ENTRY_ROLE_NAME}
                      </p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <>
                <p className="truncate text-sm font-semibold md:text-base">{pageMeta.title}</p>
                {authLoading ? (
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">Loading session…</p>
                ) : (
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {pageMeta.subtitle} · Active role: {formatRoleLabel(activeRole)}
                  </p>
                )}
              </>
            )}
          </div>
          {authed ? (
            <NotificationBellMenu
              apiBase={
                isOrgSession
                  ? "/api/projects/org-notifications"
                  : "/api/user/notifications"
              }
              viewAllHref={
                isOrgSession && orgProjectId
                  ? `/projects/${orgProjectId}/notifications`
                  : "/notifications"
              }
            />
          ) : null}
          <button
            type="button"
            title={
              mode === "dark"
                ? "Switch to light mode (saved to your account when signed in)"
                : "Switch to dark mode (saved to your account when signed in)"
            }
            aria-label={
              mode === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            onClick={toggleMode}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-zinc-700 transition hover:bg-[color:var(--nav-active-bg)] hover:text-primary dark:text-zinc-200"
          >
            {mode === "dark" ? (
              <LightModeRounded aria-hidden sx={{ fontSize: 22 }} />
            ) : (
              <DarkModeRounded aria-hidden sx={{ fontSize: 22 }} />
            )}
          </button>
          {authed ? (
            <NavbarUserMenu />
          ) : (
            <Link
              href="/login"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[color:var(--border-subtle)] px-3 py-2 text-sm font-medium text-zinc-800 transition hover:border-primary/40 hover:bg-[color:var(--nav-active-bg)] dark:text-zinc-100"
              title="Open sign-in page"
            >
              <LoginRounded aria-hidden sx={{ fontSize: 20, color: "var(--brand-blue)" }} />
              <span className="hidden sm:inline">Sign in</span>
            </Link>
          )}
          </div>
        </header>

        <ActiveOrgContextBanner />
        <ActiveCommitteeContextBanner />

        <main
          id="main-content"
          className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-6"
          tabIndex={-1}
        >
          <div className={DASHBOARD_MAIN_INNER_CLASS}>
            <StudentModeBanner />
            <JoinAcademicYearPrompt />
            <JoinPracticeProjectPrompt />
            {children}
          </div>
        </main>

        <footer className="border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] px-3 py-3 text-xs text-zinc-500 dark:text-zinc-400 md:px-6">
          <div className={DASHBOARD_MAIN_INNER_CLASS}>
            <p className="text-center">
              © {COPYRIGHT_YEAR} {ORG_NAME}. {APP_NAME}.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
