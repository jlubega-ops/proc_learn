import { normalizeEmail } from "@/lib/validation/email";
import { isMubsSchoolEmail } from "@/lib/mubs-email";

/** Shown when the value is not empty but fails MUBS rules. */
export const SCHOOL_EMAIL_INVALID_MESSAGE =
  "Not a valid school email. Use your @mubs.ac.ug address (e.g. name.surname@mubs.ac.ug or 2400123456@mubs.ac.ug).";

/**
 * Single-field validation for MUBS school email (client + API).
 * @param {unknown} raw
 * @returns {string | null} Error message, or null if valid.
 */
export function schoolEmailFieldError(raw) {
  const e = normalizeEmail(raw);
  if (!e) {
    return "School email is required.";
  }
  if (!isMubsSchoolEmail(e)) {
    return SCHOOL_EMAIL_INVALID_MESSAGE;
  }
  return null;
}
