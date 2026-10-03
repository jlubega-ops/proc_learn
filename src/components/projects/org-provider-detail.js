"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import BlockRounded from "@mui/icons-material/BlockRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
} from "@/lib/admin-mui-surfaces";
import { BRAND_TRICOLOR_STRIPE_CLASS } from "@/lib/brand-ui";
import { formatComplianceDate, PROVIDER_DOCUMENTS } from "@/lib/projects/provider-compliance";
import { providerCategoryLabel } from "@/lib/projects/provider-terms";
import {
  ProviderComplianceChecklist,
  ProviderQualificationChip,
} from "@/components/projects/org-provider-compliance";
import { OrgProviderFormDialog } from "@/components/projects/org-provider-form-dialog";
import {
  OrgProviderDeleteDialog,
  OrgProviderStatusDialog,
} from "@/components/projects/org-provider-dialogs";
import { CopyIconButton, PROVIDER_STATUS_CHIP } from "@/components/projects/org-providers-panel";

/**
 * @param {{ label: string; value: any }} p
 */
function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide opacity-60">{label}</dt>
      <dd className="wrap-break-word text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

/**
 * @param {{ projectId: string; providerId: string; backHref: string }} p
 */
export function OrgProviderDetail({ projectId, providerId, backHref }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState(/** @type {any | null} */ (null));
  const [canManage, setCanManage] = useState(false);
  const [canSeeCredentials, setCanSeeCredentials] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/providers/${providerId}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not load the provider.",
          severity: "error",
        });
        setProvider(null);
        return;
      }
      setProvider(data.provider);
      setCanManage(Boolean(data.canManage));
      setCanSeeCredentials(Boolean(data.canSeeCredentials));
    } catch {
      showToast({ message: "Network error. Please try again.", severity: "error" });
    } finally {
      setLoading(false);
    }
  }, [projectId, providerId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy role="status">
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  if (!provider) {
    return (
      <div className="space-y-3">
        <Button component={Link} href={backHref} startIcon={<ArrowBackRounded />} variant="outlined">
          Back to providers
        </Button>
        <Typography sx={adminMutedTextSx}>This provider could not be found.</Typography>
      </div>
    );
  }

  const st = PROVIDER_STATUS_CHIP[provider.status] || PROVIDER_STATUS_CHIP.ACTIVE;
  const docsHeld = PROVIDER_DOCUMENTS.filter((d) => provider.compliance?.[d.key]?.held);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          component={Link}
          href={backHref}
          startIcon={<ArrowBackRounded />}
          variant="outlined"
          className="w-full sm:w-auto"
        >
          Back to providers
        </Button>
        {canManage ? (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              startIcon={<EditRounded />}
              variant="outlined"
              onClick={() => setEditOpen(true)}
              className="w-full sm:w-auto"
            >
              Edit
            </Button>
            <Button
              startIcon={provider.status === "ACTIVE" ? <BlockRounded /> : <RestartAltRounded />}
              variant="outlined"
              color={provider.status === "ACTIVE" ? "warning" : "info"}
              onClick={() => setStatusOpen(true)}
              className="w-full sm:w-auto"
            >
              {provider.status === "ACTIVE" ? "Suspend" : "Reactivate"}
            </Button>
            <Button
              startIcon={<DeleteOutlineRounded />}
              variant="outlined"
              color="error"
              onClick={() => setDeleteOpen(true)}
              className="w-full sm:w-auto"
            >
              Delete
            </Button>
          </div>
        ) : (
          <Chip size="small" color="info" label="Read-only view" />
        )}
      </div>

      <Paper variant="outlined" sx={{ ...adminOutlinedTableContainerSx, overflow: "hidden" }}>
        <div className={BRAND_TRICOLOR_STRIPE_CLASS} aria-hidden />
        <div className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
              {provider.name}
            </Typography>
            <Chip size="small" color={st.color} label={st.label} />
            <ProviderQualificationChip qualification={provider.qualification} />
            {provider.isGenerated ? (
              <Chip size="small" variant="outlined" color="primary" label="Generated" />
            ) : null}
          </div>
          {provider.statusReason ? (
            <Typography variant="body2" color="error">
              Suspension reason: {provider.statusReason}
            </Typography>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {provider.categories.map((c) => (
              <Chip key={c} size="small" variant="outlined" color="primary" label={providerCategoryLabel(c)} />
            ))}
          </div>
        </div>
      </Paper>

      <div className="grid gap-4 lg:grid-cols-2">
        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
            Company details
          </Typography>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Contact person" value={provider.contactPerson} />
            <Field label="Business email" value={provider.email} />
            <Field label="Phone" value={provider.phone} />
            <Field label="Physical address" value={provider.physicalAddress} />
            <Field label="URSB registration number" value={provider.registrationRef} />
            <Field label="URA TIN" value={provider.tin} />
            <Field label="Lines of business" value={provider.linesOfBusiness} />
            <Field label="Simulated behaviour" value={provider.behaviourLabel} />
            <Field label="Added by" value={provider.createdBy?.displayName} />
            <Field
              label="Added on"
              value={provider.createdAt ? format(new Date(provider.createdAt), "MMM d, yyyy") : ""}
            />
          </dl>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Eligibility checks
          </Typography>
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 1 }}>
            As of {formatComplianceDate(provider.qualification.asOf)}, against the full requirement
            set for competitive methods.
          </Typography>
          <ProviderComplianceChecklist checks={provider.qualification.checks} />
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Documents on file
          </Typography>
          {docsHeld.length === 0 ? (
            <Typography sx={adminMutedTextSx}>No documents recorded.</Typography>
          ) : (
            <ul className="divide-y divide-(--border-subtle) text-sm">
              {docsHeld.map((d) => {
                const e = provider.compliance[d.key];
                return (
                  <li key={d.key} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="font-medium">{d.shortLabel}</span>
                    <span className="opacity-80">
                      {[e.number, e.expiresAt ? `expires ${formatComplianceDate(e.expiresAt)}` : null]
                        .filter(Boolean)
                        .join(" · ") || "Held"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Paper>

        {canSeeCredentials ? (
          <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Provider portal login
            </Typography>
            <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
              Simulated login for acting as this provider (bids, invoices, payments). It only works
              for this organisation.
            </Typography>
            {provider.portal ? (
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide opacity-60">Login email</dt>
                  <dd className="flex items-center gap-1">
                    <span className="break-all font-mono text-sm">{provider.portal.loginEmail}</span>
                    <CopyIconButton text={provider.portal.loginEmail} label="login email" showToast={showToast} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide opacity-60">Password</dt>
                  <dd className="flex items-center gap-1">
                    <span className="font-mono text-sm">{provider.portal.password}</span>
                    <CopyIconButton text={provider.portal.password} label="password" showToast={showToast} />
                  </dd>
                </div>
                <Field
                  label="Last portal sign-in"
                  value={
                    provider.portalLastLoginAt
                      ? format(new Date(provider.portalLastLoginAt), "MMM d, yyyy")
                      : "Never"
                  }
                />
              </dl>
            ) : (
              <Typography sx={adminMutedTextSx}>No portal login has been issued.</Typography>
            )}
          </Paper>
        ) : null}
      </div>

      {canManage ? (
        <>
          <OrgProviderFormDialog
            open={editOpen}
            projectId={projectId}
            provider={provider}
            onClose={() => setEditOpen(false)}
            onSaved={() => {
              setEditOpen(false);
              void load();
            }}
          />
          <OrgProviderStatusDialog
            projectId={projectId}
            provider={statusOpen ? provider : null}
            onClose={() => setStatusOpen(false)}
            onDone={() => {
              setStatusOpen(false);
              void load();
            }}
          />
          <OrgProviderDeleteDialog
            projectId={projectId}
            provider={deleteOpen ? provider : null}
            onClose={() => setDeleteOpen(false)}
            onDone={() => {
              setDeleteOpen(false);
              router.push(backHref);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
