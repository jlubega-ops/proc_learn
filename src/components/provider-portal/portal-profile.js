"use client";

import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import ErrorRounded from "@mui/icons-material/ErrorRounded";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import { BRAND_CARD_CLASS } from "@/lib/brand-ui";
import { formatPortalDate, portalFetch } from "@/components/provider-portal/portal-fetch";

/** @param {{ label: string; value?: import("react").ReactNode; full?: boolean }} p */
function Field({ label, value, full = false }) {
  return (
    <div className={`min-w-0 ${full ? "sm:col-span-2" : ""}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium wrap-break-word">{value || "—"}</dd>
    </div>
  );
}

/** @param {{ passed: boolean; warning: boolean }} p */
function CheckIcon({ passed, warning }) {
  if (!passed) return <ErrorRounded fontSize="small" sx={{ color: "var(--brand-red)" }} aria-label="Failed" />;
  if (warning) return <WarningAmberRounded fontSize="small" sx={{ color: "#b45309" }} aria-label="Warning" />;
  return <CheckCircleRounded fontSize="small" sx={{ color: "#16a34a" }} aria-label="Passed" />;
}

export function PortalProfile() {
  const [profile, setProfile] = useState(/** @type {any} */ (null));
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void portalFetch("/api/provider-portal/profile").then(({ ok, data }) => {
      if (cancelled) return;
      if (ok) setProfile(data.profile);
      else setError(typeof data.error === "string" ? data.error : "Could not load your profile.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!profile) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-zinc-600" role="status" aria-busy>
        <CircularProgress size={18} /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className={`${BRAND_CARD_CLASS} p-4`} aria-labelledby="pp-profile">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="pp-profile" className="text-lg font-bold wrap-break-word">
              {profile.name}
            </h2>
            <p className="text-xs text-zinc-600">{profile.organisation?.name}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Chip
              size="small"
              color={profile.status === "ACTIVE" ? "success" : "error"}
              label={profile.status === "ACTIVE" ? "Active" : profile.status === "SUSPENDED" ? "Suspended" : "Inactive"}
            />
            {profile.ppdaSuspended ? <Chip size="small" color="error" label="PPDA suspended" /> : null}
          </div>
        </div>
        {profile.statusReason ? (
          <Alert severity="error" variant="outlined" sx={{ mt: 2 }}>
            {profile.statusReason}
          </Alert>
        ) : null}
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-2">
          <Field label="Contact person" value={profile.contactPerson} />
          <Field label="Email" value={profile.email} />
          <Field label="Phone" value={profile.phone} />
          <Field label="Categories" value={profile.categoryLabels.join(", ")} />
          <Field label="URSB registration" value={profile.registrationRef} />
          <Field label="TIN" value={profile.tin} />
          <Field label="Physical address" value={profile.physicalAddress} full />
          <Field label="Lines of business" value={profile.linesOfBusiness} full />
        </dl>
      </section>

      <section className={`${BRAND_CARD_CLASS} p-4`} aria-labelledby="pp-docs">
        <h2 id="pp-docs" className="text-base font-semibold text-primary">
          Documents on record
        </h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
                <th className="py-2 pr-2">Document</th>
                <th className="py-2 pr-2">Number</th>
                <th className="py-2 pr-2">Expires</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {profile.documents.map((d) => (
                <tr key={d.key} className="border-b border-zinc-100">
                  <td className="py-2 pr-2">{d.label}</td>
                  <td className="py-2 pr-2">{d.number || "—"}</td>
                  <td className="py-2 pr-2">{d.hasExpiry ? formatPortalDate(d.expiresAt) : "No expiry"}</td>
                  <td className="py-2">
                    <Chip size="small" color={d.held ? "success" : "warning"} label={d.held ? "Held" : "Not provided"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3" aria-label="Eligibility">
        {profile.eligibility.map((e) => (
          <div key={e.method} className={`${BRAND_CARD_CLASS} p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{e.label}</h3>
              <Chip size="small" color={e.qualifies ? "success" : "error"} label={e.qualifies ? "Eligible" : "Not eligible"} />
            </div>
            <ul className="mt-2 space-y-1.5">
              {e.checks.map((c) => (
                <li key={c.key} className="flex items-start gap-2 text-xs">
                  <CheckIcon passed={c.passed} warning={c.warning} />
                  <span className="min-w-0">
                    <span className="font-medium">{c.label}</span>
                    <span className="block text-zinc-600">{c.reason}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
