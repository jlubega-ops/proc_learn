"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ImageRounded from "@mui/icons-material/ImageRounded";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import UploadRounded from "@mui/icons-material/UploadRounded";
import { useConfirm } from "@/components/providers/confirm-provider";
import { useSiteBranding } from "@/components/providers/site-branding-provider";
import { useToast } from "@/components/providers/toast-provider";
import { BRAND_CARD_CLASS } from "@/lib/brand-ui";

const ENDPOINT = "/api/admin/site-settings/branding";
const ACCEPT = "image/png,image/jpeg,image/webp";
const ALLOWED_TYPES = new Set(ACCEPT.split(","));

const ITEMS = [
  {
    kind: "logo",
    label: "Logo",
    hint: "Square PNG, max 1MB",
    maxBytes: 1024 * 1024,
    urlKey: "logoUrl",
    customKey: "logoCustom",
    previewClass: "h-16 w-16 object-contain",
  },
  {
    kind: "background",
    label: "Background image",
    hint: "Wide JPG, max 5MB",
    maxBytes: 5 * 1024 * 1024,
    urlKey: "backgroundUrl",
    customKey: "backgroundCustom",
    previewClass: "h-16 w-28 object-cover",
  },
];

/** @param {File} file @param {(typeof ITEMS)[number]} item */
function validateImage(file, item) {
  if (!ALLOWED_TYPES.has(file.type)) return "Use a PNG, JPG or WebP image.";
  if (file.size > item.maxBytes) return `${item.label} must be ${item.maxBytes / 1024 / 1024}MB or smaller.`;
  return "";
}

export function SiteBrandingPanel() {
  const router = useRouter();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const current = useSiteBranding();
  const [branding, setBranding] = useState(current);
  const [busyKind, setBusyKind] = useState("");
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const inputs = useRef(/** @type {Record<string, HTMLInputElement | null>} */ ({}));

  /** @param {Response} res @param {string} kind @param {string} success @param {string} failure */
  async function finish(res, kind, success, failure) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.fieldErrors?.[kind]) setErrors((e) => ({ ...e, [kind]: data.fieldErrors[kind] }));
      showToast({ message: typeof data.error === "string" ? data.error : failure, severity: "error" });
      return;
    }
    if (data.branding) setBranding(data.branding);
    showToast({ message: success, severity: "success" });
    router.refresh();
  }

  /** @param {(typeof ITEMS)[number]} item @param {File | undefined} file */
  async function upload(item, file) {
    if (!file) return;
    const error = validateImage(file, item);
    setErrors((e) => ({ ...e, [item.kind]: error }));
    if (error) {
      showToast({ message: error, severity: "error" });
      return;
    }
    setBusyKind(item.kind);
    try {
      const body = new FormData();
      body.set("kind", item.kind);
      body.set("file", file);
      const res = await fetch(ENDPOINT, { method: "POST", credentials: "include", body });
      await finish(res, item.kind, `${item.label} updated.`, `Could not update the ${item.label.toLowerCase()}.`);
    } catch {
      showToast({ message: `Could not update the ${item.label.toLowerCase()}.`, severity: "error" });
    } finally {
      setBusyKind("");
    }
  }

  /** @param {(typeof ITEMS)[number]} item */
  async function reset(item) {
    const ok = await confirm({
      title: `Restore the default ${item.label.toLowerCase()}?`,
      confirmLabel: "Restore",
      color: "error",
    });
    if (!ok) return;
    setBusyKind(item.kind);
    try {
      const res = await fetch(`${ENDPOINT}?kind=${item.kind}`, { method: "DELETE", credentials: "include" });
      await finish(res, item.kind, `Default ${item.label.toLowerCase()} restored.`, "Could not restore the default.");
    } catch {
      showToast({ message: "Could not restore the default.", severity: "error" });
    } finally {
      setBusyKind("");
    }
  }

  return (
    <div className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
      <div className="flex items-center gap-3">
        <ImageRounded sx={{ color: "var(--brand-blue)" }} aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Branding</h2>
      </div>
      <ul className="mt-4 divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
        {ITEMS.map((item) => {
          const busy = busyKind === item.kind;
          const custom = Boolean(branding[item.customKey]);
          return (
            <li key={item.kind} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={branding[item.urlKey]} alt={`Current ${item.label.toLowerCase()}`} className={item.previewClass} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                  <Chip size="small" label={custom ? "Custom" : "Default"} color={custom ? "primary" : "warning"} />
                </div>
                <p
                  id={`branding-${item.kind}-hint`}
                  className={`mt-0.5 text-xs ${errors[item.kind] ? "text-brand-red" : "text-zinc-600 dark:text-zinc-400"}`}
                  role={errors[item.kind] ? "alert" : undefined}
                >
                  {errors[item.kind] || item.hint}
                </p>
              </div>
              <div className="flex w-full items-center gap-1 sm:w-auto">
                <input
                  ref={(el) => {
                    inputs.current[item.kind] = el;
                  }}
                  type="file"
                  accept={ACCEPT}
                  hidden
                  aria-describedby={`branding-${item.kind}-hint`}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void upload(item, file);
                  }}
                />
                <Tooltip title={`Upload a new ${item.label.toLowerCase()}`}>
                  <span className="w-full sm:w-auto">
                    <Button
                      fullWidth
                      variant="contained"
                      disabled={Boolean(busyKind)}
                      onClick={() => inputs.current[item.kind]?.click()}
                      startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <UploadRounded />}
                    >
                      {busy ? "Saving…" : "Upload"}
                    </Button>
                  </span>
                </Tooltip>
                {custom ? (
                  <Tooltip title={`Restore the default ${item.label.toLowerCase()}`}>
                    <span>
                      <IconButton
                        aria-label={`Restore the default ${item.label.toLowerCase()}`}
                        color="error"
                        disabled={Boolean(busyKind)}
                        onClick={() => void reset(item)}
                      >
                        <RestartAltRounded />
                      </IconButton>
                    </span>
                  </Tooltip>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
