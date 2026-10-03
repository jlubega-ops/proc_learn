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
import {
  ORG_NAME_SUFFIX,
  stripOrgNameSuffix,
  validateOrgNameBase,
} from "@/lib/validation/org-display-name";

/**
 * @param {{ organizationName: string; defaultName: string }} props
 */
export function OrgDisplayNameForm({ organizationName, defaultName }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { refresh } = useAuthSession();
  const [saved, setSaved] = useState(stripOrgNameSuffix(organizationName));
  const [value, setValue] = useState(saved);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(/** @type {"" | "save" | "reset"} */ (""));

  const isDefault = saved === stripOrgNameSuffix(defaultName);
  const dirty = value.trim() !== saved;

  /** @param {Record<string, unknown>} body */
  async function send(body, mode) {
    setBusy(mode);
    try {
      const res = await fetch("/api/student/organisation-name", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.fieldErrors?.name) setError(json.fieldErrors.name);
        showToast({ message: json.error || "Could not save the name.", severity: "error" });
        return;
      }
      const base = stripOrgNameSuffix(json.organizationName);
      setSaved(base);
      setValue(base);
      setError("");
      showToast({
        message: mode === "reset" ? "Organisation name reset." : "Organisation name saved.",
        severity: "success",
      });
      await refresh();
      router.refresh();
    } catch {
      showToast({ message: "Could not save the name.", severity: "error" });
    } finally {
      setBusy("");
    }
  }

  function submit(e) {
    e.preventDefault();
    const check = validateOrgNameBase(value);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    void send({ name: check.value }, "save");
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <TextField
        label="Organisation name"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError("");
        }}
        error={Boolean(error)}
        helperText={error || " "}
        fullWidth
        sx={themedTextFieldSx}
        InputProps={{
          endAdornment: <InputAdornment position="end">{ORG_NAME_SUFFIX}</InputAdornment>,
        }}
      />
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="submit"
          variant="contained"
          disabled={!dirty || Boolean(busy)}
          startIcon={busy === "save" ? <CircularProgress size={14} color="inherit" /> : <SaveRounded />}
          className="w-full sm:w-auto"
        >
          {busy === "save" ? "Saving…" : "Save"}
        </Button>
        <Tooltip title={`Reset to ${defaultName}`}>
          <span>
            <IconButton
              aria-label="Reset organisation name"
              color="warning"
              disabled={isDefault || Boolean(busy)}
              onClick={() => void send({ reset: true }, "reset")}
            >
              {busy === "reset" ? <CircularProgress size={18} color="inherit" /> : <RestartAltRounded />}
            </IconButton>
          </span>
        </Tooltip>
      </div>
    </form>
  );
}
