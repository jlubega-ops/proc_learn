"use client";

import { useMemo, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import { ROLE } from "@/lib/roles";
import { validateStaffInviteForm } from "@/lib/validation/staff-invite-form";
import { themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";
import { useRouter } from "next/navigation";

const STAFF_ROLE_OPTIONS = [ROLE.SYSTEM_ADMIN, ROLE.EXAMINER];

function copyForToast(raw) {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!t) return "Something went wrong.";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function AdminAddStaffForm() {
  const { showToast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [sex, setSex] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [roles, setRoles] = useState(/** @type {Record<string, boolean>} */ ({}));
  /** @type {[Record<string, string>, import("react").Dispatch<import("react").SetStateAction<Record<string, string>>>]} */
  const [errors, setErrors] = useState({});

  function toggleRole(r) {
    setRoles((prev) => ({ ...prev, [r]: !prev[r] }));
  }

  const pickedRoles = useMemo(
    () => STAFF_ROLE_OPTIONS.filter((r) => roles[r]),
    [roles],
  );

  async function submit(e) {
    e.preventDefault();
    const next = validateStaffInviteForm({
      email,
      firstName,
      lastName,
      sex,
      roles: pickedRoles,
    });
    setErrors(next);
    if (Object.keys(next).length > 0) {
      showToast({
        message: "Please fix the highlighted fields.",
        severity: "error",
        duration: 6000,
      });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          firstName,
          middleName: middleName.trim() || undefined,
          lastName,
          sex: sex || undefined,
          profilePhotoUrl: profilePhotoUrl.trim() || undefined,
          roles: pickedRoles,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message:
            typeof data.error === "string" ? copyForToast(data.error) : copyForToast("could not create user."),
          severity: "error",
          duration: 8000,
        });
        return;
      }
      showToast({
        message: "Staff user created. Welcome email with sign-in details sent.",
        severity: "success",
      });
      router.push("/admin/staff");
    } finally {
      setBusy(false);
    }
  }

  const sectionSx = { color: "var(--foreground)", fontWeight: 600 };

  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex w-full max-w-3xl flex-col gap-3 rounded-xl border border-zinc-200 bg-background p-4 dark:border-zinc-800 sm:gap-4 sm:p-5"
    >
      <Typography variant="body2" sx={{ color: "color-mix(in oklab, var(--foreground) 72%, transparent)" }}>
        Staff email must be a valid <strong>@mubs.ac.ug</strong> address (not the numeric student format).
        A welcome email with a temporary password is sent automatically. The user signs in with that
        password or Google, then chooses a personal password on first access.
      </Typography>

      <Typography variant="subtitle2" sx={sectionSx}>
        Person
      </Typography>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          label="Email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value.trim());
            setErrors((p) => {
              const { email: _e, ...r } = p;
              return r;
            });
          }}
          error={Boolean(errors.email)}
          helperText={errors.email}
          fullWidth
          sx={themedTextFieldSx}
        />
        <TextField
          select
          label="Sex (optional)"
          value={sex}
          onChange={(e) => {
            setSex(e.target.value);
            setErrors((p) => {
              const { sex: _x, ...r } = p;
              return r;
            });
          }}
          error={Boolean(errors.sex)}
          helperText={errors.sex}
          fullWidth
          sx={themedTextFieldSx}
        >
          <MenuItem value="">—</MenuItem>
          <MenuItem value="MALE">Male</MenuItem>
          <MenuItem value="FEMALE">Female</MenuItem>
        </TextField>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TextField
          label="First name"
          value={firstName}
          onChange={(e) => {
            setFirstName(e.target.value);
            setErrors((p) => {
              const { firstName: _f, ...r } = p;
              return r;
            });
          }}
          error={Boolean(errors.firstName)}
          helperText={errors.firstName}
          fullWidth
          sx={themedTextFieldSx}
        />
        <TextField
          label="Middle name (optional)"
          value={middleName}
          onChange={(e) => setMiddleName(e.target.value)}
          fullWidth
          sx={themedTextFieldSx}
        />
        <TextField
          label="Last name"
          value={lastName}
          onChange={(e) => {
            setLastName(e.target.value);
            setErrors((p) => {
              const { lastName: _l, ...r } = p;
              return r;
            });
          }}
          error={Boolean(errors.lastName)}
          helperText={errors.lastName}
          fullWidth
          sx={themedTextFieldSx}
        />
      </div>
      <TextField
        label="Profile photo URL (optional)"
        value={profilePhotoUrl}
        onChange={(e) => setProfilePhotoUrl(e.target.value)}
        fullWidth
        sx={themedTextFieldSx}
      />

      <Divider sx={{ borderColor: "color-mix(in oklab, var(--foreground) 12%, transparent)" }} />

      <Typography variant="subtitle2" sx={sectionSx}>
        Roles
      </Typography>
      {errors.roles ? (
        <Typography variant="caption" color="error">
          {errors.roles}
        </Typography>
      ) : null}
      <FormGroup className="max-w-md">
        {STAFF_ROLE_OPTIONS.map((r) => (
          <FormControlLabel
            key={r}
            control={
              <Checkbox
                checked={Boolean(roles[r])}
                onChange={() => {
                  toggleRole(r);
                  setErrors((p) => {
                    const { roles: _ro, ...rest } = p;
                    return rest;
                  });
                }}
              />
            }
            label={r.replace(/_/g, " ")}
          />
        ))}
      </FormGroup>

      <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button type="submit" variant="contained" disabled={busy} className="w-full sm:w-auto">
          {busy ? <CircularProgress size={22} color="inherit" /> : "Create staff user"}
        </Button>
      </div>
    </form>
  );
}
