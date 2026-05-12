import { isStudentMubsEmail, isValidStudentNumberDigits } from "@/lib/mubs-email";

/**
 * Client-side student account fields (create + edit). Do not rely on HTML `required`.
 * @param {{
 *   email: string;
 *   studentNumber: string;
 *   firstName: string;
 *   lastName: string;
 *   middleName?: string;
 *   registrationNumber: string;
 *   programmeId: string;
 *   academicYearLabel: string;
 *   sex?: string;
 * }} v
 * @returns {Record<string, string>}
 */
export function validateStudentAccountForm(v) {
  /** @type {Record<string, string>} */
  const errors = {};

  const email = String(v.email ?? "").trim().toLowerCase();
  if (!email) errors.email = "School email is required.";
  else if (!isStudentMubsEmail(email)) {
    errors.email = "Use only digits before @mubs.ac.ug (example: 2300123456@mubs.ac.ug).";
  }

  const sn = String(v.studentNumber ?? "").replace(/\D/g, "");
  if (!sn) errors.studentNumber = "Student number is required.";
  else if (!isValidStudentNumberDigits(sn)) {
    errors.studentNumber = "Student number must be 1–32 digits.";
  }

  if (!String(v.firstName ?? "").trim()) errors.firstName = "First name is required.";
  if (!String(v.lastName ?? "").trim()) errors.lastName = "Last name is required.";

  if (!String(v.registrationNumber ?? "").trim()) {
    errors.registrationNumber = "Registration number is required.";
  }

  if (!String(v.programmeId ?? "").trim()) errors.programmeId = "Programme is required.";

  if (!String(v.academicYearLabel ?? "").trim()) {
    errors.academicYearLabel = "Academic year is required.";
  }

  const sex = v.sex != null ? String(v.sex).trim().toUpperCase() : "";
  if (sex && sex !== "MALE" && sex !== "FEMALE") {
    errors.sex = "Choose male or female.";
  }

  return errors;
}
