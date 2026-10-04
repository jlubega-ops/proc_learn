"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";
import { useToast } from "@/components/providers/toast-provider";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { BRAND_CARD_CLASS, BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";
import {
  ORG_NAME_SUFFIX,
  stripOrgNameSuffix,
  validateOrgNameBase,
} from "@/lib/validation/org-display-name";
import { validateVoteCode } from "@/lib/validation/vote-code";

/**
 * @typedef {{
 *   organizationName: string;
 *   defaultName: string;
 *   voteCode: string;
 *   projectCode: string | null;
 *   canEditName: boolean;
 * }} OrgSettings
 */

/** @param {OrgSettings} s */
function toForm(s) {
  return { name: stripOrgNameSuffix(s.organizationName), voteCode: s.voteCode || "" };
}

/**
 * @param {{ projectId: string; initialSettings: OrgSettings; readOnly?: boolean }} props
 */
export function OrgSettingsPanel({ projectId, initialSettings, readOnly = false }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { refresh } = useAuthSession();
  const [settings, setSettings] = useState(initialSettings);
  const [form, setForm] = useState(() => toForm(initialSettings));
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [busy, setBusy] = useState(/** @type {"" | "save" | "reset"} */ (""));

  const saved = toForm(settings);
  const nameDirty = settings.canEditName && form.name.trim() !== saved.name;
  const voteDirty = form.voteCode.trim() !== saved.voteCode;
  const isDefaultName = saved.name === stripOrgNameSuffix(settings.defaultName);

  /** @param {string} key @param {string} value */
  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  }

  /** @param {Record<string, unknown>} body @param {"save" | "reset"} mode */
  async function send(body, mode) {
    setBusy(mode);
    try {
      const res = await fetch(`/api/projects/${projectId}/org-settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.fieldErrors) setErrors(json.fieldErrors);
        showToast({ message: json.error || "Could not save settings.", severity: "error" });
        return;
      }
      setSettings(json.settings);
      setForm(toForm(json.settings));
      setErrors({});
      showToast({
        message: mode === "reset" ? "Organisation name reset." : "Settings saved.",
        severity: "success",
      });
      if (body.name !== undefined || body.resetName) await refresh();
      router.refresh();
    } catch {
      showToast({ message: "Could not save settings.", severity: "error" });
    } finally {
      setBusy("");
    }
  }

  function submit(e) {
    e.preventDefault();
    /** @type {Record<string, string>} */
    const next = {};
    /** @type {Record<string, unknown>} */
    const body = {};
    if (nameDirty) {
      const check = validateOrgNameBase(form.name);
      if (check.ok) body.name = check.value;
      else next.name = check.error;
    }
    if (voteDirty) {
      const check = validateVoteCode(form.voteCode);
      if (check.ok) body.voteCode = check.value || "";
      else next.voteCode = check.error;
    }
    if (Object.keys(next).length) {
      setErrors(next);
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    void send(body, "save");
  }

  return (
    <form noValidate onSubmit={submit} className={`${BRAND_CARD_CLASS} space-y-4 p-4 sm:p-5`}>
      <h2 className={BRAND_SECTION_TITLE_CLASS}>Organisation</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex items-start gap-1 md:col-span-2">
          <TextField
            label="Organisation name"
            value={settings.canEditName ? form.name : settings.organizationName}
            onChange={(e) => setField("name", e.target.value)}
            error={Boolean(errors.name)}
            helperText={errors.name || (settings.canEditName ? " " : "Set by the assignment")}
            disabled={readOnly || !settings.canEditName}
            fullWidth
            sx={themedTextFieldSx}
            slotProps={
              settings.canEditName
                ? {
                    input: {
                      endAdornment: <InputAdornment position="end">{ORG_NAME_SUFFIX}</InputAdornment>,
                    },
                  }
                : undefined
            }
          />
          {settings.canEditName && !readOnly ? (
            <Tooltip title={`Reset to ${settings.defaultName}`}>
              <span>
                <IconButton
                  aria-label="Reset organisation name"
                  color="warning"
                  disabled={isDefaultName || Boolean(busy)}
                  onClick={() => void send({ resetName: true }, "reset")}
                >
                  {busy === "reset" ? <CircularProgress size={18} color="inherit" /> : <RestartAltRounded />}
                </IconButton>
              </span>
            </Tooltip>
          ) : null}
        </div>

        <TextField
          label="Organisation code"
          value={settings.projectCode || "—"}
          helperText="System assigned"
          fullWidth
          sx={themedTextFieldSx}
          slotProps={{ input: { readOnly: true } }}
        />

        <TextField
          label="Vote number"
          placeholder="e.g. 120"
          value={form.voteCode}
          onChange={(e) => setField("voteCode", e.target.value.replace(/\D/g, "").slice(0, 3))}
          error={Boolean(errors.voteCode)}
          helperText={errors.voteCode || "Used on requisitions"}
          disabled={readOnly}
          fullWidth
          sx={themedTextFieldSx}
          slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 3 } }}
        />
      </div>

      {readOnly ? null : (
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="contained"
            disabled={(!nameDirty && !voteDirty) || Boolean(busy)}
            startIcon={busy === "save" ? <CircularProgress size={14} color="inherit" /> : <SaveRounded />}
            className="w-full sm:w-auto"
          >
            {busy === "save" ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </form>
  );
}
