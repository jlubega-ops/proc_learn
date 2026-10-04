import { normalizeEmail } from "@/lib/validation/email";
import { schoolEmailFieldError } from "@/lib/validation/school-email";
import { parseOrgLoginIdentifier } from "@/lib/projects/org-login-identity";

/**
 * Canonical login email (trim + lower case). Empty if input is blank.
 * @param {unknown} raw
 */
export function normalizeLoginEmail(raw) {
  return normalizeEmail(raw);
}

/**
 * Login field validation (shared client + API). **Email only** — no username login.
 * Accepts `identifier` or legacy `email` key (value must be a valid email).
 * @param {{ identifier?: string; email?: string; password: string }} values
 * @returns {{ identifier?: string; password?: string }}
 */
export function validateLoginFields(values) {
  const password = values.password ?? "";
  const errors = {};
  const identifier = values.identifier ?? values.email ?? "";

  if (!parseOrgLoginIdentifier(identifier)) {
    const schoolErr = schoolEmailFieldError(identifier);
    if (schoolErr) {
      errors.identifier = String(identifier).toLowerCase().includes("org-")
        ? "Enter the organisation login email exactly as shown."
        : schoolErr;
    }
  }

  if (!password) {
    errors.password = "password is required.";
  } else if (password.length < 6) {
    errors.password = "password must be at least 6 characters.";
  }

  return errors;
}
