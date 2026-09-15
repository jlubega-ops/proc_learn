"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useAppTheme } from "@/components/providers/theme-provider";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { useToast } from "@/components/providers/toast-provider";
import { ROLE_LABELS } from "@/lib/roles";
import { adminMutedTextSx, themedTextFieldSx } from "@/lib/admin-mui-surfaces";

function tabKeyFromIndex(i) {
  if (i === 1) return "password";
  if (i === 2) return "settings";
  return "details";
}

function indexFromTabKey(tab) {
  if (tab === "password") return 1;
  if (tab === "settings") return 2;
  return 0;
}

export function AccountProfileTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") || "details";
  const tabIndex = indexFromTabKey(tabParam);

  const { showToast } = useToast();
  const { refresh } = useAuthSession();
  const { mode, setMode } = useAppTheme();

  const [profile, setProfile] = useState(/** @type {any | null} */ (null));
  const [profileLoading, setProfileLoading] = useState(true);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const res = await fetch("/api/user/profile", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfile(null);
        return;
      }
      setProfile(data);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const onTabChange = (_e, next) => {
    const key = tabKeyFromIndex(next);
    router.replace(`/profile?tab=${key}`, { scroll: false });
  };

  async function submitPassword(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast({ message: "New passwords do not match.", severity: "error" });
      return;
    }
    setPwBusy(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not update password.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Password updated.", severity: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-background dark:border-zinc-800">
      <Box sx={{ borderBottom: 1, borderColor: "divider", px: 2 }}>
        <Tabs value={tabIndex} onChange={onTabChange} aria-label="Account sections">
          <Tab label="Your details" id="tab-details" aria-controls="tab-panel-details" />
          <Tab label="Reset password" id="tab-password" aria-controls="tab-panel-password" />
          <Tab label="Settings" id="tab-settings" aria-controls="tab-panel-settings" />
        </Tabs>
      </Box>

      <div className="p-6">
        {tabIndex === 0 ? (
          <div id="tab-panel-details" role="tabpanel" aria-labelledby="tab-details">
            {profileLoading ? (
              <CircularProgress size={28} sx={{ color: "#008bd0" }} />
            ) : !profile ? (
              <Typography color="error">Could not load your profile.</Typography>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Detail label="Email" value={profile.email} />
                <Detail label="First name" value={profile.firstName} />
                <Detail label="Middle name" value={profile.middleName || "—"} />
                <Detail label="Last name" value={profile.lastName} />
                <Detail label="Sex" value={profile.sex || "—"} />
                <Detail label="Account status" value={profile.accountStatus} />
                <Detail
                  label="Activated"
                  value={
                    profile.activatedAt
                      ? new Date(profile.activatedAt).toLocaleString()
                      : "—"
                  }
                />
                <Detail
                  label="Last sign-in"
                  value={
                    profile.lastLoginAt
                      ? new Date(profile.lastLoginAt).toLocaleString()
                      : "—"
                  }
                />
                <Detail
                  label="Roles granted"
                  value={(profile.roles || []).map((r) => ROLE_LABELS[r] || r).join(", ") || "—"}
                />
                <Detail
                  label="Active role (in session)"
                  value={ROLE_LABELS[profile.activeRole] || profile.activeRole || "—"}
                />
                {profile.studentProfile ? (
                  <>
                    <Divider className="sm:col-span-2" />
                    <Typography
                      variant="subtitle2"
                      className="sm:col-span-2"
                      sx={{ fontWeight: 700, color: "var(--foreground)" }}
                    >
                      Student record
                    </Typography>
                    <Detail label="Student number" value={profile.studentProfile.studentNumber} />
                    <Detail
                      label="Registration number"
                      value={profile.studentProfile.registrationNumber}
                    />
                    <Detail label="Programme" value={profile.studentProfile.programmeName} />
                    <Detail
                      label="Campus"
                      value={
                        profile.studentProfile.campusLabel ||
                        profile.studentProfile.campus ||
                        "—"
                      }
                    />
                    <Detail
                      label="Academic year"
                      value={
                        profile.studentProfile.enrolledAcademicYearLabel ||
                        profile.studentProfile.academicYearLabel
                      }
                    />
                    <Detail label="Year of study" value={String(profile.studentProfile.yearOfStudy)} />
                  </>
                ) : null}
                <Detail
                  label="Profile photo URL"
                  value={profile.profilePhotoUrl || "—"}
                  className="sm:col-span-2"
                />
              </div>
            )}
          </div>
        ) : null}

        {tabIndex === 1 ? (
          <div id="tab-panel-password" role="tabpanel" aria-labelledby="tab-password">
            <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
              Use a strong password. It must be at least 8 characters (same rules as email reset).
            </Typography>
            <form noValidate onSubmit={submitPassword} className="flex max-w-md flex-col gap-3">
              <TextField
                label="Current password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                sx={themedTextFieldSx}
              />
              <TextField
                label="New password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                sx={themedTextFieldSx}
              />
              <TextField
                label="Confirm new password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                sx={themedTextFieldSx}
              />
              <Button type="submit" variant="contained" disabled={pwBusy}>
                {pwBusy ? <CircularProgress size={22} color="inherit" /> : "Update password"}
              </Button>
            </form>
          </div>
        ) : null}

        {tabIndex === 2 ? (
          <div id="tab-panel-settings" role="tabpanel" aria-labelledby="tab-settings">
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: "var(--foreground)" }}>
              Appearance
            </Typography>
            <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
              Theme is saved to your account when you are signed in.
            </Typography>
            <RadioGroup
              row
              value={mode}
              onChange={(e) => {
                const m = e.target.value === "dark" ? "dark" : "light";
                setMode(m);
                void refresh();
              }}
            >
              <FormControlLabel value="light" control={<Radio />} label="Light" />
              <FormControlLabel value="dark" control={<Radio />} label="Dark" />
            </RadioGroup>
            <Alert severity="info" sx={{ mt: 2 }}>
              Sign-in and forgot-password pages stay in light mode for readability.
            </Alert>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * @param {{ label: string; value: string; className?: string }} p
 */
function Detail({ label, value, className }) {
  return (
    <div className={className}>
      <Typography variant="caption" sx={adminMutedTextSx}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, color: "var(--foreground)" }}>
        {value}
      </Typography>
    </div>
  );
}
