import { isStaffMubsEmail } from "@/lib/mubs-email";

/**
 * Client-side validation for staff invite (create staff). Do not rely on HTML `required`.
 * @param {{
 *   email: string;
 *   firstName: string;
 *   lastName: string;
 *   sex?: string;
 *   roles: string[];
 * }} v
 * @returns {Record<string, string>}
 */
export function validateStaffInviteForm(v) {
  /** @type {Record<string, string>} */
  const errors = {};

  const email = String(v.email ?? "").trim().toLowerCase();
  if (!email) errors.email = "Email is required.";
  else if (!isStaffMubsEmail(email)) {
    errors.email =
      "Use a staff-style @mubs.ac.ug address (letters; not the numeric student format).";
  }

  if (!String(v.firstName ?? "").trim()) errors.firstName = "First name is required.";
  if (!String(v.lastName ?? "").trim()) errors.lastName = "Last name is required.";

  const sex = v.sex != null ? String(v.sex).trim().toUpperCase() : "";
  if (sex && sex !== "MALE" && sex !== "FEMALE") {
    errors.sex = "Choose male or female.";
  }

  if (!Array.isArray(v.roles) || v.roles.length === 0) {
    errors.roles = "Select at least one role.";
  }

  return errors;
}
