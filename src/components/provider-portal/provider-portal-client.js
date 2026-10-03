"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import CampaignRounded from "@mui/icons-material/CampaignRounded";
import LocalShippingRounded from "@mui/icons-material/LocalShippingRounded";
import LogoutRounded from "@mui/icons-material/LogoutRounded";
import MenuRounded from "@mui/icons-material/MenuRounded";
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
import {
  PortalInvoices,
  PortalOpportunities,
  PortalOrders,
  PortalPayments,
} from "@/components/provider-portal/provider-portal-sections";

const SECTIONS = [
  {
    key: "opportunities",
    label: "Opportunities",
    subtitle: "Requests for quotation and advertised tenders",
    Icon: CampaignRounded,
  },
  {
    key: "orders",
    label: "Orders",
    subtitle: "Purchase instructions, LPOs and contracts issued to you",
    Icon: LocalShippingRounded,
  },
  { key: "invoices", label: "Invoices", subtitle: "Invoices you submitted and their status", Icon: ReceiptLongRounded },
  { key: "payments", label: "Payments", subtitle: "Payments made against your invoices", Icon: PaymentsRounded },
];

const navIconSx = { fontSize: 20, color: "var(--brand-blue)" };

export function ProviderPortalClient() {
  const { showToast } = useToast();
  const [me, setMe] = useState(/** @type {any} */ (null));
  const [section, setSection] = useState("opportunities");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [invoiceReloadKey, setInvoiceReloadKey] = useState(0);
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

  const current = SECTIONS.find((s) => s.key === section) || SECTIONS[0];

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

        {me ? (
          <div className="shrink-0 border-b border-(--border-subtle) px-4 py-3">
            <p className="truncate text-sm font-semibold">{me.name}</p>
            <p className="truncate text-xs text-zinc-500">{me.organisation?.name}</p>
          </div>
        ) : null}

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label="Portal sections">
          <ul className="flex flex-col gap-1 p-3">
            {SECTIONS.map(({ key, label, Icon }) => {
              const active = key === section;
              return (
                <li key={key} className="list-none">
                  <button
                    type="button"
                    title={`Open ${label}`}
                    aria-current={active ? "page" : undefined}
                    onClick={() => {
                      setSection(key);
                      setDrawerOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                      active ? BRAND_NAV_ACTIVE_CLASS : BRAND_NAV_INACTIVE_CLASS
                    }`}
                  >
                    <Icon aria-hidden sx={navIconSx} />
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-(--border-subtle) p-3">
          <Button
            fullWidth
            variant="outlined"
            color="error"
            onClick={signOut}
            disabled={signingOut}
            startIcon={signingOut ? <CircularProgress size={16} color="inherit" /> : <LogoutRounded />}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
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
            {me ? (
              <div className="hidden min-w-0 text-right sm:block">
                <p className="truncate text-sm font-semibold">{me.name}</p>
                <p className="truncate text-xs text-zinc-500">{me.organisation?.name}</p>
              </div>
            ) : null}
          </div>
        </header>

        <main id="main-content" className="flex-1 px-3 py-5 md:px-6">
          <div className={`${DASHBOARD_MAIN_INNER_CLASS} space-y-4`}>
            {section === "opportunities" ? (
              <div className="rounded-xl border border-(--border-subtle) bg-white p-4 shadow-sm">
                <h1 className="text-xl font-bold">Welcome{me ? `, ${me.contactPerson || me.name}` : ""}</h1>
                <p className="mt-1 text-sm text-zinc-600">
                  Respond to quotations and tenders, follow your orders and submit invoices to{" "}
                  {me?.organisation?.name || "the organisation"}. This is a learning simulation.
                </p>
                {me?.portalLastLoginAt ? (
                  <p className="mt-1 text-xs text-zinc-500">Signed in {formatPortalDateTime(me.portalLastLoginAt)}</p>
                ) : null}
              </div>
            ) : null}

            {section === "opportunities" ? <PortalOpportunities /> : null}
            {section === "orders" ? <PortalOrders onInvoiced={() => setInvoiceReloadKey((k) => k + 1)} /> : null}
            {section === "invoices" ? <PortalInvoices reloadKey={invoiceReloadKey} /> : null}
            {section === "payments" ? <PortalPayments /> : null}
          </div>
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
