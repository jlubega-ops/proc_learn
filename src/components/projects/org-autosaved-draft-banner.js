"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import Link from "next/link";
import { format } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import { useConfirm } from "@/components/providers/confirm-provider";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { clearFormDraft, formDraftScope } from "@/lib/form-draft";
import { BRAND_CARD_CLASS } from "@/lib/brand-ui";
import { adminMutedTextSx } from "@/lib/admin-mui-surfaces";

/**
 * @param {{
 *   projectId: string;
 *   formKey: string;
 *   continueHref: string;
 *   noun?: string;
 *   onChange?: (draft: { formKey: string; title: string; reference: string; updatedAt: string } | null) => void;
 * }} p
 */
export function OrgAutosavedDraftBanner({
  projectId,
  formKey,
  continueHref,
  noun = "form",
  onChange,
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { session } = useAuthSession();
  const [draft, setDraft] = useState(
    /** @type {{ formKey: string; title: string; reference: string; updatedAt: string } | null} */ (
      null
    ),
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/form-drafts?keys=${encodeURIComponent(formKey)}`,
        { credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDraft(null);
        onChange?.(null);
        return;
      }
      const row = Array.isArray(data.drafts) ? data.drafts.find((d) => d.formKey === formKey) : null;
      const next = row
        ? {
            formKey: row.formKey,
            title: String(row.title || "").trim(),
            reference: String(row.reference || "").trim(),
            updatedAt: row.updatedAt,
          }
        : null;
      setDraft(next);
      onChange?.(next);
    } finally {
      setLoading(false);
    }
  }, [formKey, onChange, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function discard() {
    const ok = await confirm({
      title: "Discard auto-saved draft?",
      message: "This removes the unfinished form. Saved drafts on the list are not affected.",
      confirmLabel: "Discard",
      cancelLabel: "Keep",
      color: "error",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/form-drafts?formKey=${encodeURIComponent(formKey)}`,
        { method: "DELETE", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not discard draft.",
          severity: "error",
        });
        return;
      }
      const scope = formDraftScope(session);
      if (scope) clearFormDraft(`${scope}:${projectId}:${formKey}`);
      setDraft(null);
      onChange?.(null);
      showToast({ message: "Auto-saved draft discarded.", severity: "success" });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !draft) return null;

  const label = draft.title || draft.reference || `Unfinished ${noun}`;
  const savedAt = draft.updatedAt
    ? format(new Date(draft.updatedAt), "MMM d, yyyy HH:mm")
    : "";

  return (
    <div
      className={`${BRAND_CARD_CLASS} flex flex-col gap-3 border-brand-yellow/60 bg-[color-mix(in_oklab,var(--brand-yellow)_12%,var(--surface-elevated))] p-3 sm:flex-row sm:items-center sm:justify-between`}
      role="status"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Chip size="small" color="warning" label="Auto saved" />
          <Typography className="truncate text-sm font-semibold">{label}</Typography>
        </div>
        <Typography sx={adminMutedTextSx} className="text-xs">
          {savedAt ? `Last saved ${savedAt}. ` : ""}
          Continue editing — submit only from the form.
        </Typography>
      </div>
      <Box className="flex flex-wrap items-center gap-1 sm:justify-end">
        <Button
          component={Link}
          href={continueHref}
          variant="contained"
          size="small"
          startIcon={<EditRounded />}
          className="cursor-pointer"
          title="Continue editing this auto-saved draft"
        >
          Continue
        </Button>
        <Tooltip title="Discard auto-saved draft">
          <span>
            <IconButton
              size="small"
              color="error"
              aria-label="Discard auto-saved draft"
              disabled={busy}
              onClick={() => void discard()}
              className="cursor-pointer disabled:cursor-not-allowed"
            >
              {busy ? <CircularProgress size={16} /> : <DeleteOutlineRounded fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </div>
  );
}
