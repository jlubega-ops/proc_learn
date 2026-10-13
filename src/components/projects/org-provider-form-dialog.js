"use client";

import { useEffect, useState } from "react";
import { addYears, format } from "date-fns";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import DoneAllRounded from "@mui/icons-material/DoneAllRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";
import { discardConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useDraftState } from "@/hooks/use-draft-state";
import { adminDialogPaperSx, adminMutedTextSx, themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { PROVIDER_DOCUMENTS } from "@/lib/projects/provider-compliance";
import { PROVIDER_CONDUCT_TRAITS } from "@/lib/projects/provider-behaviours";
import { PROVIDER_CATEGORY_OPTIONS } from "@/lib/projects/provider-terms";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emptyCompliance() {
  return Object.fromEntries(
    PROVIDER_DOCUMENTS.map((d) => [d.key, { held: false, number: "", expiresAt: "" }]),
  );
}

/**
 * @param {any} provider
 */
function formFromProvider(provider) {
  const compliance = emptyCompliance();
  if (provider?.compliance) {
    for (const d of PROVIDER_DOCUMENTS) {
      const e = provider.compliance[d.key];
      if (e) {
        compliance[d.key] = {
          held: Boolean(e.held),
          number: e.number || "",
          expiresAt: e.expiresAt || "",
        };
      }
    }
  }
  return {
    name: provider?.name || "",
    email: provider?.email || "",
    phone: provider?.phone || "",
    contactPerson: provider?.contactPerson || "",
    physicalAddress: provider?.physicalAddress || "",
    registrationRef: provider?.registrationRef || "",
    tin: provider?.tin || "",
    categories: Array.isArray(provider?.categories) ? provider.categories : [],
    linesOfBusiness: provider?.linesOfBusiness || "",
    compliance,
    ppdaSuspended: Boolean(provider?.ppdaSuspended),
    conductIssues: Array.isArray(provider?.conductIssues) ? provider.conductIssues : [],
  };
}

/**
 * @param {ReturnType<typeof formFromProvider>} form
 */
function validate(form) {
  /** @type {Record<string, string>} */
  const e = {};
  if (!form.name.trim()) e.name = "Enter the provider's registered name.";
  if (!form.physicalAddress.trim()) e.physicalAddress = "Enter the provider's physical address.";
  if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) e.email = "Enter a valid email address.";
  if (form.tin.trim() && !/^\d{10}$/.test(form.tin.replace(/\s+/g, ""))) {
    e.tin = "A URA TIN has exactly 10 digits.";
  }
  if (!form.categories.length) e.categories = "Choose at least one category.";
  for (const d of PROVIDER_DOCUMENTS) {
    const c = form.compliance[d.key];
    if (c?.held && d.hasExpiry && !c.expiresAt) {
      e[`compliance.${d.key}.expiresAt`] = "Enter the expiry date.";
    }
  }
  return e;
}

/**
 * Create / edit a provider in the organisation register.
 * @param {{
 *   open: boolean;
 *   projectId: string;
 *   provider?: any;
 *   onClose: () => void;
 *   onSaved: (provider: any) => void;
 * }} p
 */
export function OrgProviderFormDialog({ open, projectId, provider = null, onClose, onSaved }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const { showToast } = useToast();
  const confirm = useConfirm();
  const isEdit = Boolean(provider?.id);
  const draftId = provider?.id || "new";
  const [form, setForm, draft] = useDraftState(`org:provider:edit:${draftId}`, formFromProvider(provider), {
    enabled: open,
    resetKey: open ? draftId : null,
  });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setErrors({});
  }, [open]);

  async function handleCancel() {
    if (busy) return;
    if (draft.isDirty && !(await confirm(discardConfirmOptions()))) return;
    draft.clearDraft();
    onClose();
  }

  /**
   * @param {string} key
   * @param {any} value
   */
  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  }

  /**
   * @param {string} docKey
   * @param {Partial<{ held: boolean; number: string; expiresAt: string }>} patch
   */
  function setDoc(docKey, patch) {
    setForm((f) => ({
      ...f,
      compliance: { ...f.compliance, [docKey]: { ...f.compliance[docKey], ...patch } },
    }));
    const errKey = `compliance.${docKey}.expiresAt`;
    if (errors[errKey]) setErrors((e) => ({ ...e, [errKey]: "" }));
  }

  function tickAllCompliant() {
    const expiry = format(addYears(new Date(), 1), "yyyy-MM-dd");
    setForm((f) => {
      const compliance = { ...f.compliance };
      for (const d of PROVIDER_DOCUMENTS) {
        const cur = compliance[d.key];
        compliance[d.key] = {
          held: true,
          number:
            cur.number ||
            (d.key === "URSB_REGISTRATION" ? f.registrationRef : d.key === "TIN" ? f.tin : ""),
          expiresAt: d.hasExpiry ? cur.expiresAt || expiry : "",
        };
      }
      return { ...f, compliance, ppdaSuspended: false };
    });
    setErrors((e) =>
      Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith("compliance."))),
    );
  }

  async function submit(e) {
    e.preventDefault();
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const url = isEdit
        ? `/api/projects/${projectId}/providers/${provider.id}`
        : `/api/projects/${projectId}/providers`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(isEdit ? { action: "update" } : {}), ...form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setErrors(data.fieldErrors);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save the provider.",
          severity: "error",
        });
        return;
      }
      showToast({ message: isEdit ? "Provider updated." : "Provider added to the register.", severity: "success" });
      draft.clearDraft();
      onSaved(data.provider);
    } catch {
      showToast({ message: "Network error. Please try again.", severity: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      fullWidth
      maxWidth="md"
      fullScreen={fullScreen}
      slotProps={{ paper: { sx: adminDialogPaperSx } }}
    >
      <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <DialogTitle>{isEdit ? `Edit ${provider?.name || "provider"}` : "Add provider"}</DialogTitle>
        <DialogContent dividers className="space-y-5">
          <section className="space-y-3">
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Company details
            </Typography>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                name="name"
                label="Registered name"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                error={Boolean(errors.name)}
                helperText={errors.name || ""}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Contact person"
                value={form.contactPerson}
                onChange={(e) => setField("contactPerson", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                name="email"
                label="Business email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                error={Boolean(errors.email)}
                helperText={errors.email || ""}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Phone"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                name="physicalAddress"
                label="Physical address"
                value={form.physicalAddress}
                onChange={(e) => setField("physicalAddress", e.target.value)}
                error={Boolean(errors.physicalAddress)}
                helperText={errors.physicalAddress || ""}
                fullWidth
                sx={themedTextFieldSx}
                className="sm:col-span-2"
              />
              <TextField
                label="URSB registration number"
                value={form.registrationRef}
                onChange={(e) => setField("registrationRef", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                name="tin"
                label="URA TIN"
                value={form.tin}
                onChange={(e) => setField("tin", e.target.value)}
                error={Boolean(errors.tin)}
                helperText={errors.tin || "10 digits"}
                fullWidth
                sx={themedTextFieldSx}
                slotProps={{ htmlInput: { inputMode: "numeric" } }}
              />
            </div>
          </section>

          <section className="space-y-2">
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Categories and lines of business
            </Typography>
            <div className="flex flex-wrap gap-x-4">
              {PROVIDER_CATEGORY_OPTIONS.map((o) => (
                <FormControlLabel
                  key={o.value}
                  control={
                    <Checkbox
                      checked={form.categories.includes(o.value)}
                      onChange={(e) =>
                        setField(
                          "categories",
                          e.target.checked
                            ? [...form.categories, o.value]
                            : form.categories.filter((c) => c !== o.value),
                        )
                      }
                    />
                  }
                  label={o.label}
                />
              ))}
            </div>
            {errors.categories ? <FormHelperText error>{errors.categories}</FormHelperText> : null}
            <TextField
              label="Lines of business"
              placeholder="e.g. ICT equipment, stationery, office furniture"
              value={form.linesOfBusiness}
              onChange={(e) => setField("linesOfBusiness", e.target.value)}
              fullWidth
              sx={themedTextFieldSx}
            />
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Registrations and compliance documents
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<DoneAllRounded />}
                onClick={tickAllCompliant}
                title="Tick every document as held with a valid expiry date"
              >
                Tick all (fully compliant)
              </Button>
            </div>
            <Typography variant="body2" sx={adminMutedTextSx}>
              Tick what this provider holds. Documents with an expiry date only count while they are
              valid.
            </Typography>
            <ul className="divide-y divide-(--border-subtle)">
              {PROVIDER_DOCUMENTS.map((d) => {
                const c = form.compliance[d.key];
                const errKey = `compliance.${d.key}.expiresAt`;
                return (
                  <li key={d.key} className="flex flex-wrap items-start gap-3 py-2">
                    <FormControlLabel
                      className="min-w-0 flex-1 basis-56"
                      control={
                        <Checkbox
                          checked={Boolean(c?.held)}
                          onChange={(e) => setDoc(d.key, { held: e.target.checked })}
                        />
                      }
                      label={<span className="text-sm">{d.label}</span>}
                    />
                    {c?.held ? (
                      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                        <TextField
                          label={d.numberLabel}
                          value={c.number}
                          onChange={(e) => setDoc(d.key, { number: e.target.value })}
                          sx={{ ...themedTextFieldSx, minWidth: 180 }}
                          className="w-full sm:w-auto"
                        />
                        {d.hasExpiry ? (
                          <TextField
                            name={errKey}
                            label="Expiry date"
                            type="date"
                            value={c.expiresAt}
                            onChange={(e) => setDoc(d.key, { expiresAt: e.target.value })}
                            error={Boolean(errors[errKey])}
                            helperText={errors[errKey] || ""}
                            slotProps={{ inputLabel: { shrink: true } }}
                            sx={{ ...themedTextFieldSx, minWidth: 160 }}
                            className="w-full sm:w-auto"
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <FormControlLabel
              control={
                <Checkbox
                  color="error"
                  checked={form.ppdaSuspended}
                  onChange={(e) => setField("ppdaSuspended", e.target.checked)}
                />
              }
              label={<span className="text-sm">Listed on the PPDA suspended providers list</span>}
            />
          </section>

          <section className="space-y-2">
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Provider behaviour
            </Typography>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {PROVIDER_CONDUCT_TRAITS.map((t) => (
                <FormControlLabel
                  key={t.issue}
                  title={`Untick if the provider: ${t.problem.toLowerCase()}`}
                  control={
                    <Checkbox
                      checked={!form.conductIssues.includes(t.issue)}
                      onChange={(e) =>
                        setField(
                          "conductIssues",
                          e.target.checked
                            ? form.conductIssues.filter((i) => i !== t.issue)
                            : [...form.conductIssues, t.issue],
                        )
                      }
                    />
                  }
                  label={<span className="text-sm">{t.label}</span>}
                />
              ))}
            </div>
          </section>
        </DialogContent>
        <DialogActions className="flex-wrap gap-2">
          <Button onClick={handleCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SaveRounded />}
          >
            {busy ? "Saving…" : isEdit ? "Save changes" : "Add provider"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
