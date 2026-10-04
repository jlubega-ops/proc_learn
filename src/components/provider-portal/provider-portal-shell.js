"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Badge from "@mui/material/Badge";
import Divider from "@mui/material/Divider";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import AccountCircleRounded from "@mui/icons-material/AccountCircleRounded";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import AssignmentRounded from "@mui/icons-material/AssignmentRounded";
import BadgeRounded from "@mui/icons-material/BadgeRounded";
import CampaignRounded from "@mui/icons-material/CampaignRounded";
import LogoutRounded from "@mui/icons-material/LogoutRounded";
import MenuRounded from "@mui/icons-material/MenuRounded";
import NotificationsRounded from "@mui/icons-material/NotificationsRounded";
import PaymentsRounded from "@mui/icons-material/PaymentsRounded";
import ReceiptLongRounded from "@mui/icons-material/ReceiptLongRounded";
import { useToast } from "@/components/providers/toast-provider";
import {
  BRAND_NAV_ACTIVE_CLASS,
  BRAND_NAV_INACTIVE_CLASS,
  BRAND_TRICOLOR_STRIPE_CLASS,
  brandIconSx,
} from "@/lib/brand-ui";
import { DASHBOARD_MAIN_INNER_CLASS } from "@/lib/dashboard-content-width";
import { formatPortalDateTime, portalFetch } from "@/components/provider-portal/portal-fetch";

export const PORTAL_NAV = [
  { href: "/provider-portal", label: "Assignments", subtitle: "Orders and work assigned to you", Icon: AssignmentRounded },
  {
    href: "/provider-portal/opportunities",
    label: "Opportunities",
    subtitle: "Requests for quotation and advertised tenders",
    Icon: CampaignRounded,
  },
  { href: "/provider-portal/invoices", label: "Invoices", subtitle: "Invoices you submitted", Icon: ReceiptLongRounded },
  { href: "/provider-portal/payments", label: "Payments", subtitle: "Payments made to you", Icon: PaymentsRounded },
];

/** Reached from the account menu / bell, not the sidebar. */
const PORTAL_ACCOUNT_PAGES = [
  {
    href: "/provider-portal/notifications",
    label: "Notifications",
    subtitle: "Everything that happened on your account",
    Icon: NotificationsRounded,
  },
  { href: "/provider-portal/profile", label: "Profile", subtitle: "Your details and eligibility", Icon: BadgeRounded },
];

const navIconSx = { fontSize: 20, color: "var(--brand-blue)" };

/** @param {string} pathname */
function currentSection(pathname) {
  if (pathname.startsWith("/provider-portal/assignments")) return PORTAL_NAV[0];
  const match = [...PORTAL_NAV, ...PORTAL_ACCOUNT_PAGES]
    .reverse()
    .find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  return match || PORTAL_NAV[0];
}

/** @param {string | null | undefined} name */
function initialsOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0] ? parts[0].slice(0, 2).toUpperCase() : "?";
}

/**
 * Same account menu pattern as the signed-in dashboard (avatar → profile, notifications, sign out).
 * @param {{ me: any; onSignOut: () => void }} p
 */
function PortalUserMenu({ me, onSignOut }) {
  const router = useRouter();
  const [anchor, setAnchor] = useState(/** @type {HTMLElement | null} */ (null));
  const name = me?.name || "Account";
  const go = (/** @type {string} */ href) => {
    setAnchor(null);
    router.push(href);
  };
  return (
    <>
      <div className="flex min-w-0 max-w-36 shrink items-center gap-2 sm:max-w-52 md:max-w-64">
        <span className="hidden min-w-0 truncate text-right text-sm font-medium text-zinc-800 sm:block" title={name}>
          {name}
        </span>
        <button
          type="button"
          title="Account menu"
          aria-haspopup="true"
          aria-expanded={Boolean(anchor)}
          aria-label={`Account menu for ${name}`}
          onClick={(e) => setAnchor(e.currentTarget)}
          className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full ring-2 ring-zinc-200 hover:ring-primary/50"
        >
          <Avatar sx={{ width: 36, height: 36, bgcolor: "var(--brand-blue)", fontSize: 16 }}>{initialsOf(me?.name)}</Avatar>
        </button>
      </div>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { minWidth: 240 } } }}
      >
        <MenuItem disabled sx={{ cursor: "default", opacity: "1 !important", py: 1.5 }}>
          <ListItemText
            primary={name}
            secondary={me?.organisation?.name || me?.email || "—"}
            slotProps={{
              primary: { variant: "body2", fontWeight: 600, noWrap: true },
              secondary: { variant: "caption", noWrap: true },
            }}
          />
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => go("/provider-portal/notifications")}>
          <ListItemIcon>
            <NotificationsRounded fontSize="small" />
          </ListItemIcon>
          Notifications
        </MenuItem>
        <MenuItem onClick={() => go("/provider-portal/profile")}>
          <ListItemIcon>
            <AccountCircleRounded fontSize="small" />
          </ListItemIcon>
          Profile
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onSignOut();
          }}
          sx={{
            color: "#f87171",
            "&:hover": { bgcolor: "color-mix(in oklab, var(--brand-red) 14%, transparent)" },
          }}
        >
          <ListItemIcon sx={{ color: "#f87171" }}>
            <LogoutRounded fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}

export const PORTAL_NOTIFICATIONS_CHANGED = "portal-notifications-changed";

function PortalBell() {
  const pathname = usePathname();
  const router = useRouter();
  const [anchor, setAnchor] = useState(/** @type {HTMLElement | null} */ (null));
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState(/** @type {any[]} */ ([]));
  const [open, setOpen] = useState(/** @type {any} */ (null));

  const load = useCallback(async () => {
    const { ok, data } = await portalFetch("/api/provider-portal/notifications?filter=unread&pageSize=5");
    if (!ok) return;
    setUnread(Number(data.unread) || 0);
    setItems(Array.isArray(data.items) ? data.items : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void portalFetch("/api/provider-portal/notifications?filter=unread&pageSize=5").then(({ ok, data }) => {
      if (cancelled || !ok) return;
      setUnread(Number(data.unread) || 0);
      setItems(Array.isArray(data.items) ? data.items : []);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    const onChange = () => void load();
    window.addEventListener(PORTAL_NOTIFICATIONS_CHANGED, onChange);
    return () => window.removeEventListener(PORTAL_NOTIFICATIONS_CHANGED, onChange);
  }, [load]);

  async function openItem(n) {
    setAnchor(null);
    setOpen(n);
    await portalFetch("/api/provider-portal/notifications", { method: "PATCH", body: JSON.stringify({ ids: [n.id] }) });
    void load();
  }

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          aria-label={`Notifications, ${unread} unread`}
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={brandIconSx}
        >
          <Badge badgeContent={unread} color="error" max={99}>
            <NotificationsRounded />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 340, maxWidth: "90vw" } } }}
      >
        {items.length === 0 ? (
          <MenuItem disabled>No unread notifications.</MenuItem>
        ) : (
          items.map((n) => (
            <MenuItem key={n.id} onClick={() => void openItem(n)} sx={{ whiteSpace: "normal", display: "block" }}>
              <p className="text-sm font-semibold">{n.title}</p>
              <p className="line-clamp-2 text-xs text-zinc-600">{n.body}</p>
              <p className="text-[11px] text-zinc-500">{formatPortalDateTime(n.createdAt)}</p>
            </MenuItem>
          ))
        )}
        <MenuItem component={Link} href="/provider-portal/notifications" onClick={() => setAnchor(null)}>
          <span className="w-full text-center text-sm font-semibold text-primary">View all notifications</span>
        </MenuItem>
      </Menu>
      <Dialog open={Boolean(open)} onClose={() => setOpen(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{open?.title}</DialogTitle>
        <DialogContent dividers>
          <p className="whitespace-pre-wrap text-sm">{open?.body}</p>
          <p className="mt-2 text-xs text-zinc-500">{formatPortalDateTime(open?.createdAt)}</p>
        </DialogContent>
        <DialogActions className="flex-wrap gap-2">
          <Button onClick={() => setOpen(null)}>Close</Button>
          {open?.linkUrl ? (
            <Button
              variant="contained"
              onClick={() => {
                const url = open.linkUrl;
                setOpen(null);
                router.push(url);
              }}
            >
              Open
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>
    </>
  );
}

/** @param {{ children: import("react").ReactNode }} p */
export function ProviderPortalShell({ children }) {
  const { showToast } = useToast();
  const pathname = usePathname() || "/provider-portal";
  const [me, setMe] = useState(/** @type {any} */ (null));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void portalFetch("/api/provider-portal/me").then(({ ok, data }) => {
      if (!cancelled && ok) setMe(data.provider);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/provider-portal/logout", { method: "POST", credentials: "include", keepalive: true });
      showToast({ message: "Signed out successfully.", severity: "success", duration: 2000 });
    } catch {
      /* leave regardless */
    }
    window.location.replace("/login");
  }

  const current = currentSection(pathname);

  return (
    <div className="flex min-h-dvh bg-surface-muted text-zinc-900">
      {signingOut ? (
        <div
          className="fixed inset-0 z-130 flex items-center justify-center bg-white/80 backdrop-blur-sm"
          role="status"
          aria-busy
        >
          <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-lg">
            <CircularProgress size={22} />
            <span className="text-sm font-medium">Signing you out…</span>
          </div>
        </div>
      ) : null}

      <div
        className={`fixed inset-0 z-40 bg-black/40 transition md:hidden ${
          drawerOpen ? "visible opacity-100" : "invisible opacity-0"
        }`}
        aria-hidden={!drawerOpen}
        onClick={() => setDrawerOpen(false)}
      />
      <aside
        id="portal-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-64 max-w-[85vw] flex-col border-r border-(--border-subtle) bg-(--surface-sidebar) shadow-xl transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 md:shadow-none ${
          drawerOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        aria-label="Provider portal navigation"
      >
        <div className={BRAND_TRICOLOR_STRIPE_CLASS} aria-hidden />
        <div className="flex shrink-0 items-center gap-3 border-b border-(--border-subtle) bg-linear-to-r from-[color-mix(in_oklab,var(--brand-blue)_6%,var(--surface-sidebar))] to-(--surface-sidebar) px-4 py-4">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white">
            <Image src="/assets/mubs.png" alt="MUBS logo" fill sizes="40px" className="object-contain" priority />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold tracking-tight text-primary">Proc Learn</p>
            <p className="truncate text-xs text-zinc-500">Provider portal</p>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label="Portal sections">
          <ul className="flex flex-col gap-1 p-3">
            {PORTAL_NAV.map(({ href, label, Icon }) => {
              const active = current.href === href;
              return (
                <li key={href} className="list-none">
                  <Link
                    href={href}
                    title={`Open ${label}`}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                      active ? BRAND_NAV_ACTIVE_CLASS : BRAND_NAV_INACTIVE_CLASS
                    }`}
                  >
                    <Icon aria-hidden sx={navIconSx} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-(--border-subtle) bg-(--surface-elevated)/90 backdrop-blur-md">
          <div className={BRAND_TRICOLOR_STRIPE_CLASS} aria-hidden />
          <div className="flex h-14 items-center gap-3 px-3 md:px-6">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-primary transition hover:bg-(--nav-active-bg) md:hidden"
              title="Open navigation menu"
              aria-controls="portal-sidebar"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((o) => !o)}
            >
              <MenuRounded aria-hidden sx={brandIconSx} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold md:text-base">{current.label}</p>
              <p className="truncate text-xs text-zinc-500">{current.subtitle}</p>
            </div>
            <PortalBell />
            <PortalUserMenu me={me} onSignOut={() => void signOut()} />
          </div>
        </header>

        <main id="main-content" className="flex-1 px-3 py-5 md:px-6">
          <div className={`${DASHBOARD_MAIN_INNER_CLASS} space-y-4`}>{children}</div>
        </main>

        <footer className="border-t border-(--border-subtle) bg-white">
          <div className={`${DASHBOARD_MAIN_INNER_CLASS} px-3 py-3 text-xs text-zinc-500 md:px-6`}>
            Proc Learn · Makerere University Business School
          </div>
        </footer>
      </div>
    </div>
  );
}
