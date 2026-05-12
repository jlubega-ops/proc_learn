import { normalizeEmail } from "@/lib/validation/email";

/** Student email: digits only local part @mubs.ac.ug */
const STUDENT_EMAIL_RE = /^(\d+)@mubs\.ac\.ug$/i;

/** Staff / general MUBS mailbox (not all-digit local part). */
const STAFF_MUBS_EMAIL_RE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?@mubs\.ac\.ug$/i;

/**
 * @param {unknown} email
 */
export function isStudentMubsEmail(email) {
  const e = normalizeEmail(email);
  return STUDENT_EMAIL_RE.test(e);
}

/**
 * @param {unknown} email
 * @returns {string | null} digits local part
 */
export function studentNumberFromStudentEmail(email) {
  const e = normalizeEmail(email);
  const m = e.match(STUDENT_EMAIL_RE);
  return m ? m[1] : null;
}

/**
 * @param {unknown} email
 */
export function isStaffMubsEmail(email) {
  const e = normalizeEmail(email);
  if (!STAFF_MUBS_EMAIL_RE.test(e)) return false;
  if (STUDENT_EMAIL_RE.test(e)) return false;
  return true;
}

/**
 * Any institutional mailbox: **digits@mubs.ac.ug** (student) or staff-style **local@mubs.ac.ug** (not all-digit local part).
 * @param {unknown} email
 */
export function isMubsSchoolEmail(email) {
  return isStudentMubsEmail(email) || isStaffMubsEmail(email);
}

/**
 * Student profile number: digits only, length within DB column.
 * @param {unknown} studentNumber
 */
export function isValidStudentNumberDigits(studentNumber) {
  const s = String(studentNumber ?? "").replace(/\D/g, "");
  return /^[0-9]{1,32}$/.test(s);
}
