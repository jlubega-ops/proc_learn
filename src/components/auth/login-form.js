"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import {
  ThemeProvider as MuiLoginThemeProvider,
  createTheme,
} from "@mui/material/styles";
import {
  APP_NAME,
  DEFAULT_POST_AUTH_PATH,
  ORG_NAME,
  ORG_SHORT,
} from "@/lib/appConfig";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import {
  consumePostAuthToast,
  setClientSigningOutFlag,
} from "@/lib/auth/client-sign-out";
import { useToast } from "@/components/providers/toast-provider";
import { validateLoginFields } from "@/lib/validation/login";

/** Turn API / lowercased strings into readable toast sentences. */
function copyForToast(raw) {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!t) return "Something went wrong.";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const loginMuiTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#008bd0" },
    background: { default: "#fafafa", paper: "#ffffff" },
    text: { primary: "#18181b", secondary: "#52525b" },
  },
});

const OAUTH_ERROR_HINTS = {
  oauth_state: "Google sign-in was interrupted. Please try again.",
  oauth_token: "Google could not complete sign-in. Please try again.",
  oauth_userinfo: "Could not verify your Google account. Please try again.",
  oauth_email: "Google did not return an email address.",
  oauth_config: "Google sign-in is not configured on the server.",
  auth_config: "Sign-in is not configured on the server.",
  google_not_registered:
    "No account exists for that Google email. Use your issued credentials or contact support.",
  oauth_mubs_email:
    "Google sign-in requires a valid @mubs.ac.ug school email on your Google account.",
  account_suspended:
    "That account is suspended. Contact support if you think this is a mistake.",
};

/**
 * @param {{ initialNext?: string; oauthError?: string }} props
 */
export function LoginForm({
  initialNext = DEFAULT_POST_AUTH_PATH,
  oauthError = "",
  idleLogout = false,
}) {
  const router = useRouter();
  const { refresh } = useAuthSession();
  const { showToast } = useToast();
  const afterLoginPath = useMemo(
    () => safeNextPath(initialNext),
    [initialNext],
  );

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  /** Brief read-only mount avoids browsers pre-filling credentials before first paint. */
  const [fieldsUnlocked, setFieldsUnlocked] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setFieldsUnlocked(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    setClientSigningOutFlag(false);
    const queued = consumePostAuthToast();
    if (queued?.message) {
      showToast({
        message: queued.message,
        severity: queued.severity === "success" ? "success" : "error",
        duration:
          typeof queued.duration === "number" && queued.duration > 0
            ? queued.duration
            : 6000,
      });
    }
  }, [showToast]);

  useEffect(() => {
    if (!idleLogout) return;
    if (typeof window === "undefined") return;
    const dedupeKey = "pl_idle_logout_toast";
    if (window.sessionStorage.getItem(dedupeKey)) return;
    window.sessionStorage.setItem(dedupeKey, "1");
    showToast({
      message:
        "You were signed out after a period of inactivity. Please sign in again.",
      severity: "error",
      duration: 8000,
    });
  }, [idleLogout, showToast]);

  useEffect(() => {
    if (!oauthError) return;
    if (typeof window === "undefined") return;
    const dedupeKey = `pl_oauth_err_toast:${oauthError}:${afterLoginPath}`;
    if (window.sessionStorage.getItem(dedupeKey)) return;
    window.sessionStorage.setItem(dedupeKey, "1");
    const hint =
      OAUTH_ERROR_HINTS[
        /** @type {keyof typeof OAUTH_ERROR_HINTS} */ (oauthError)
      ] || "Sign-in with Google did not complete.";
    showToast({ message: hint, severity: "error", duration: 8000 });
    router.replace(`/login?next=${encodeURIComponent(afterLoginPath)}`, {
      scroll: false,
    });
  }, [oauthError, afterLoginPath, router, showToast]);

  async function handleSubmit(e) {
    e.preventDefault();
    const nextErrors = validateLoginFields({ identifier, password });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (
          res.status === 400 &&
          data.fields &&
          typeof data.fields === "object" &&
          Object.keys(data.fields).length > 0
        ) {
          setErrors(
            /** @type {Record<string, string>} */ ({
              ...data.fields,
            }),
          );
          return;
        }
        const msg =
          typeof data.error === "string"
            ? copyForToast(data.error)
            : copyForToast("sign-in failed. try again.");
        showToast({ message: msg, severity: "error", duration: 8000 });
        return;
      }

      await refresh();
      showToast({
        message: "Signed in successfully.",
        severity: "success",
        duration: 2800,
      });
      await new Promise((r) => setTimeout(r, 450));
      const dest =
        data.mustChangePassword || data.redirectTo === "/setup-password"
          ? "/setup-password"
          : typeof data.redirectTo === "string" &&
              data.redirectTo.startsWith("/")
            ? data.redirectTo
            : afterLoginPath;
      router.push(dest);
    } finally {
      setSubmitting(false);
    }
  }

  const identifierInvalid = Boolean(errors.identifier);
  const passwordInvalid = Boolean(errors.password);

  const googleStartHref = `/api/auth/google/start?next=${encodeURIComponent(afterLoginPath)}`;

  const fieldSx = {
    "& .MuiOutlinedInput-root": {
      bgcolor: "background.paper",
    },
  };

  const identifierFieldSx = {
    ...fieldSx,
    ...(identifierInvalid && {
      "& .MuiFormHelperText-root": { textTransform: "lowercase" },
    }),
  };

  const passwordFieldSx = {
    ...fieldSx,
    ...(passwordInvalid && {
      "& .MuiFormHelperText-root": { textTransform: "lowercase" },
    }),
  };

  return (
    <MuiLoginThemeProvider theme={loginMuiTheme}>
      <div className="flex w-full max-h-[calc(100dvh-1.5rem)] max-w-[min(100%,22rem)] justify-center sm:max-w-md">
        <div className="flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-white/60 border-t-4 border-t-[#ed1c24] bg-white/95 shadow-2xl backdrop-blur-sm">
          <div className="px-4 py-3 sm:px-5 sm:py-4">
            <div className="mb-3 flex flex-col items-center text-center">
              <div className="relative mb-2 h-14 w-14 shrink-0 sm:h-16 sm:w-16">
                <Image
                  src="/assets/mubs.png"
                  alt={`${ORG_NAME} logo`}
                  fill
                  sizes="64px"
                  className="object-contain"
                  priority
                />
              </div>
              <p
                className="font-extrabold tracking-tight text-[#008bd0]"
                style={{
                  fontSize: "clamp(1.35rem, 5vw, 1.85rem)",
                  lineHeight: 1.1,
                }}
              >
                {APP_NAME}
              </p>
              <p className="mt-0.5 max-w-sm text-[10px] font-semibold uppercase leading-tight tracking-[0.12em] text-zinc-600 sm:text-[11px]">
                {ORG_SHORT} · {ORG_NAME}
              </p>
              <h1 className="mt-2 text-lg font-bold tracking-tight text-zinc-900 sm:text-xl">
                Sign in to continue
              </h1>
              <p className="mt-1 text-center text-xs leading-snug text-zinc-600 sm:text-[13px]">
                Use your MUBS school email, organisation username, or{" "}
                <a
                  href={googleStartHref}
                  className="cursor-pointer font-semibold text-[#008bd0] underline decoration-[#008bd0]/40 underline-offset-2 hover:decoration-[#008bd0]"
                >
                  continue with school email
                </a>
                .
              </p>
            </div>

            <form
              noValidate
              autoComplete="off"
              onSubmit={handleSubmit}
              className="flex flex-col gap-3 sm:gap-4"
            >
              <TextField
                id="login-identifier"
                name="pl_login_identifier"
                label="School email or organisation username"
                type="text"
                inputMode="text"
                autoComplete="off"
                fullWidth
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  setErrors((prev) => {
                    const { identifier: _i, ...rest } = prev;
                    return rest;
                  });
                }}
                error={identifierInvalid}
                helperText={identifierInvalid ? errors.identifier : undefined}
                slotProps={{
                  htmlInput: {
                    readOnly: !fieldsUnlocked,
                    autoComplete: "off",
                    "data-1p-ignore": "true",
                    "data-lpignore": "true",
                    "data-form-type": "other",
                    title: "Your MUBS school email address",
                  },
                }}
                sx={identifierFieldSx}
              />

              <TextField
                id="login-password"
                name="pl_login_credential"
                label="Password"
                type={showPassword ? "text" : "password"}
                autoComplete="off"
                fullWidth
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((prev) => {
                    const { password: _p, ...rest } = prev;
                    return rest;
                  });
                }}
                error={passwordInvalid}
                helperText={passwordInvalid ? errors.password : undefined}
                slotProps={{
                  htmlInput: {
                    readOnly: !fieldsUnlocked,
                    autoComplete: "off",
                    "data-1p-ignore": "true",
                    "data-lpignore": "true",
                    "data-form-type": "other",
                    title: "Your account password",
                  },
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          edge="end"
                          aria-label={
                            showPassword ? "hide password" : "show password"
                          }
                          title={
                            showPassword ? "Hide password" : "Show password"
                          }
                          onClick={() => setShowPassword((v) => !v)}
                          onMouseDown={(ev) => ev.preventDefault()}
                        >
                          {showPassword ? (
                            <VisibilityOff fontSize="small" />
                          ) : (
                            <Visibility fontSize="small" />
                          )}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
                sx={passwordFieldSx}
              />

              <div className="flex items-center justify-between gap-2 text-xs text-zinc-700 sm:text-sm">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    name="remember"
                    className="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-[#008bd0] focus:ring-[#008bd0] sm:h-4 sm:w-4"
                    title="Keep you signed in on this device (when supported)"
                  />
                  Remember me
                </label>
                <Link
                  href="/forgot-password"
                  className="shrink-0 cursor-pointer font-medium text-[#008bd0] hover:underline"
                  title="Reset your password"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                title="Sign in with your school email and password"
                className="flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#008bd0] text-sm font-semibold text-white shadow hover:bg-[#0076b0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008bd0] disabled:cursor-wait disabled:opacity-90"
              >
                {submitting ? (
                  <>
                    <CircularProgress size={22} thickness={5} color="inherit" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            <div className="relative mt-3 py-0.5 text-center text-[10px] text-zinc-500 sm:text-xs">
              <span className="relative z-10 bg-white/95 px-2" aria-hidden>
                or
              </span>
              <span className="absolute left-0 right-0 top-1/2 z-0 h-px -translate-y-1/2 bg-zinc-200" />
            </div>

            <a
              href={googleStartHref}
              className="mt-2 flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-center text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008bd0]"
              title="Continue with your school Google account"
            >
              <svg
                aria-hidden
                className="h-5 w-5 shrink-0"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Continue with school email</span>
            </a>

            <p className="mt-3 text-center text-[10px] leading-snug text-zinc-500 sm:text-xs">
              By continuing you agree to follow {APP_NAME} acceptable use
              policies.
            </p>
          </div>
        </div>
      </div>
    </MuiLoginThemeProvider>
  );
}
