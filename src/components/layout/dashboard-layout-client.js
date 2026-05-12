"use client";

import Link from "next/link";
import { Fragment, Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Image from "next/image";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import DarkModeRounded from "@mui/icons-material/DarkModeRounded";
import LightModeRounded from "@mui/icons-material/LightModeRounded";
import LoginRounded from "@mui/icons-material/LoginRounded";
import MenuRounded from "@mui/icons-material/MenuRounded";
import AccountCircleRounded from "@mui/icons-material/AccountCircleRounded";
import WestRounded from "@mui/icons-material/WestRounded";
import { APP_NAME, COPYRIGHT_YEAR, ORG_NAME } from "@/lib/appConfig";
import { useAppTheme } from "@/components/providers/theme-provider";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { sidebarNavForContext } from "@/lib/nav-config";
import { formatRoleLabel } from "@/lib/roles";
import { NavbarUserMenu } from "@/components/layout/navbar-user-menu";
import { NotificationBellMenu } from "@/components/layout/notification-bell-menu";
import { RoleSwitchOverlay } from "@/components/layout/role-switch-overlay";
import { getDashboardPageMeta } from "@/lib/dashboard-page-meta";
import { DASHBOARD_MAIN_INNER_CLASS } from "@/lib/dashboard-content-width";

const primaryIconSx = { fontSize: 22, color: "#008bd0" };

/**
 * @param {string} pathname
 */
function projectIdFromPath(pathname) {
  const m = String(pathname || "").match(/^\/projects\/([^/]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : "";
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

  if (navPathname === base) return true;
  if (base !== "/" && navPathname.startsWith(`${base}/`)) return true;
  return false;
}

/**
 * @param {{ onNavigate: () => void; activeRole: string; searchParams: URLSearchParams }} p
 */
function NavLinks({ onNavigate, activeRole, searchParams }) {
  const navPathname = usePathname();
  const sections = sidebarNavForContext(activeRole, navPathname || "/");

  const childActive = (children) =>
    Array.isArray(children) &&
    children.some((child) => navItemIsActive(navPathname || "/", searchParams, child.href));

  return (
    <ul className="flex flex-col gap-1 p-3">
      {sections.map((section, sectionIndex) => (
        <Fragment key={section.id}>
          {sectionIndex > 0 ? (
            <li aria-hidden className="mx-2 my-2 list-none border-t border-zinc-200 dark:border-zinc-700" />
          ) : null}
          {section.label ? (
            <li className="list-none px-3 pb-1 pt-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {section.label}
              </span>
            </li>
          ) : null}
          {section.links.map(({ href, label, title, Icon, children }) => {
            if (Array.isArray(children) && children.length > 0) {
              const hasActiveChild = childActive(children);
              return (
                <li key={`${section.id}::${label}`} className="list-none">
                  <details open={hasActiveChild} className="group rounded-lg">
                    <summary
                      title={title}
                      className={`flex cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        hasActiveChild
                          ? "bg-[#008bd0]/12 text-[#008bd0] dark:bg-[#008bd0]/22"
                          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
                                active
                                  ? "bg-[#008bd0]/15 text-[#008bd0] dark:bg-[#008bd0]/25"
                                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                              }`}
                            >
                              <ChildIcon aria-hidden sx={{ fontSize: 20, color: "#008bd0" }} />
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
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008bd0] ${
                    active
                      ? "bg-[#008bd0]/15 text-[#008bd0] dark:bg-[#008bd0]/25"
                      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  }`}
                >
                  <Icon aria-hidden sx={primaryIconSx} />
                  {label}
                </Link>
              </li>
            );
          })}
        </Fragment>
      ))}
    </ul>
  );
}

function NavLinksWithSearch(props) {
  const searchParams = useSearchParams();
  return <NavLinks {...props} searchParams={searchParams} />;
}

export default function DashboardLayoutClient({ children }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [leaveOrgOpen, setLeaveOrgOpen] = useState(false);
  const { mode, toggleMode } = useAppTheme();
  const { session, loading: authLoading } = useAuthSession();
  const activeRole = session?.activeRole ?? "STUDENT";
  const projectId = projectIdFromPath(pathname || "/");
  const isStudentProjectWorld = activeRole === "STUDENT" && Boolean(projectId);
  const [projectOrgLabel, setProjectOrgLabel] = useState("");
  const [projectOrgLoading, setProjectOrgLoading] = useState(false);

  const authed = Boolean(session?.authenticated);
  const pageMeta = getDashboardPageMeta(pathname || "/", activeRole);

  useEffect(() => {
    if (!isStudentProjectWorld || !projectId) {
      setProjectOrgLabel("");
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
      })
      .finally(() => {
        if (!cancelled) setProjectOrgLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isStudentProjectWorld, projectId]);

  useEffect(() => {
    if (!isStudentProjectWorld || !projectId) return;
    const currentPath = window.location.pathname + window.location.search;
    window.history.pushState({ projectWorld: true, projectId }, "", currentPath);

    const onPopState = () => {
      const nextPath = window.location.pathname;
      if (!nextPath.startsWith(`/projects/${projectId}`)) {
        window.history.pushState({ projectWorld: true, projectId }, "", currentPath);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isStudentProjectWorld, projectId]);

  return (
    <div className="flex min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <RoleSwitchOverlay />
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
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-64 max-w-[85vw] flex-col border-r border-zinc-200 bg-white shadow-xl transition-transform dark:border-zinc-800 dark:bg-zinc-900 md:sticky md:top-0 md:h-screen md:translate-x-0 md:shadow-none ${
          drawerOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        aria-label="Main navigation"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
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
            <p className="truncate text-base font-extrabold tracking-tight text-[#008bd0]">
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
            />
          </Suspense>
        </nav>

        <div className="shrink-0 border-t border-zinc-200 p-3 dark:border-zinc-800">
          {authed && isStudentProjectWorld ? (
            <button
              type="button"
              title="Leave this organization workspace"
              onClick={() => setLeaveOrgOpen(true)}
              className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <WestRounded aria-hidden sx={primaryIconSx} />
              Leave organization
            </button>
          ) : authed ? (
            <Link
              href="/profile?tab=details"
              title="Open your profile"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <AccountCircleRounded aria-hidden sx={primaryIconSx} />
              Profile
            </Link>
          ) : !authed ? (
            <Link
              href="/login"
              title="Open the sign-in page"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <LoginRounded aria-hidden sx={primaryIconSx} />
              Sign in
            </Link>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-zinc-200 bg-white/90 px-3 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90 md:px-6">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 md:hidden"
            title="Open navigation menu"
            aria-controls="app-sidebar"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((o) => !o)}
          >
            <MenuRounded aria-hidden sx={{ fontSize: 24, color: "#008bd0" }} />
          </button>
          <div className="min-w-0 flex-1">
            {isStudentProjectWorld ? (
              <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold md:text-base">{pageMeta.title}</p>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{pageMeta.subtitle}</p>
                </div>
                <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Organization workspace
                  </p>
                  <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                    Organization: {projectOrgLoading ? "Loading…" : projectOrgLabel || "Current organization"}
                  </p>
                  <p className="truncate text-[11px] font-bold uppercase tracking-wide text-primary">
                    Role: System admin
                  </p>
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
          {authed ? <NotificationBellMenu /> : null}
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
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
              title="Open sign-in page"
            >
              <LoginRounded
                aria-hidden
                sx={{ fontSize: 20, color: "#008bd0" }}
              />
              <span className="hidden sm:inline">Sign in</span>
            </Link>
          )}
        </header>

        <main
          id="main-content"
          className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-6"
          tabIndex={-1}
        >
          <div className={DASHBOARD_MAIN_INNER_CLASS}>{children}</div>
        </main>

        <footer className="border-t border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 md:px-6">
          <div className={DASHBOARD_MAIN_INNER_CLASS}>
            <p className="text-center">
              © {COPYRIGHT_YEAR} {ORG_NAME}. {APP_NAME}.
            </p>
          </div>
        </footer>
      </div>

      <Dialog
        open={leaveOrgOpen}
        onClose={() => setLeaveOrgOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Leave organization?</DialogTitle>
        <DialogContent dividers>
          You are about to leave this organization workspace. Continue working here or close and return to My
          Projects.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaveOrgOpen(false)}>Continue working</Button>
          <Button
            variant="contained"
            onClick={() => {
              setLeaveOrgOpen(false);
              setDrawerOpen(false);
              window.location.assign("/projects");
            }}
          >
            Close and leave
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
