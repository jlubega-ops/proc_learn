import { normalizeEmail } from "@/lib/validation/email";

/**
 * @param {unknown} value
 */
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @param {unknown} email
 */
export function isWellFormedOrgEmail(email) {
  const v = cleanText(email);
  if (!v || v.length > 255) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * @param {unknown} body
 * @returns {{
 *   ok: true;
 *   data: {
 *     firstName: string;
 *     middleName: string | null;
 *     lastName: string;
 *     email: string;
 *     projectOrgRoleId: string;
 *     departmentId: string;
 *     subunitId: string | null;
 *   };
 * } | { ok: false; errors: Record<string, string> }}
 */
export function validateProjectOrgUserInput(body) {
  /** @type {Record<string, string>} */
  const errors = {};

  const firstName = cleanText(body?.firstName);
  const middleNameRaw = body?.middleName;
  const middleName =
    middleNameRaw === undefined || middleNameRaw === null
      ? null
      : cleanText(middleNameRaw) || null;
  const lastName = cleanText(body?.lastName);
  const email = normalizeEmail(body?.email);
  const projectOrgRoleId = cleanText(body?.projectOrgRoleId);
  const departmentId = cleanText(body?.departmentId);
  const subunitIdRaw = body?.subunitId;
  const subunitId =
    subunitIdRaw === undefined || subunitIdRaw === null || subunitIdRaw === ""
      ? null
      : cleanText(subunitIdRaw);

  if (!firstName) errors.firstName = "First name is required.";
  else if (firstName.length > 100) errors.firstName = "First name is too long.";

  if (middleName && middleName.length > 100) {
    errors.middleName = "Middle name is too long.";
  }

  if (!lastName) errors.lastName = "Last name is required.";
  else if (lastName.length > 100) errors.lastName = "Last name is too long.";

  if (!email) errors.email = "Email is required.";
  else if (!isWellFormedOrgEmail(email)) errors.email = "Enter a valid email address.";

  if (!projectOrgRoleId) errors.projectOrgRoleId = "Role is required.";
  if (!departmentId) errors.departmentId = "Department is required.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      firstName,
      middleName,
      lastName,
      email,
      projectOrgRoleId,
      departmentId,
      subunitId,
    },
  };
}

/**
 * @param {unknown} body
 */
export function validateProjectOrgUserPatch(body) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<string, unknown>} */
  const data = {};

  if (body?.firstName !== undefined) {
    const firstName = cleanText(body.firstName);
    if (!firstName) errors.firstName = "First name is required.";
    else if (firstName.length > 100) errors.firstName = "First name is too long.";
    else data.firstName = firstName;
  }

  if (body?.middleName !== undefined) {
    if (body.middleName === null) data.middleName = null;
    else {
      const middleName = cleanText(body.middleName) || null;
      if (middleName && middleName.length > 100) errors.middleName = "Middle name is too long.";
      else data.middleName = middleName;
    }
  }

  if (body?.lastName !== undefined) {
    const lastName = cleanText(body.lastName);
    if (!lastName) errors.lastName = "Last name is required.";
    else if (lastName.length > 100) errors.lastName = "Last name is too long.";
    else data.lastName = lastName;
  }

  if (body?.email !== undefined) {
    const email = normalizeEmail(body.email);
    if (!email) errors.email = "Email is required.";
    else if (!isWellFormedOrgEmail(email)) errors.email = "Enter a valid email address.";
    else data.email = email;
  }

  if (body?.projectOrgRoleId !== undefined) {
    const projectOrgRoleId = cleanText(body.projectOrgRoleId);
    if (!projectOrgRoleId) errors.projectOrgRoleId = "Role is required.";
    else data.projectOrgRoleId = projectOrgRoleId;
  }

  if (body?.departmentId !== undefined) {
    const departmentId = cleanText(body.departmentId);
    if (!departmentId) errors.departmentId = "Department is required.";
    else data.departmentId = departmentId;
  }

  if (body?.subunitId !== undefined) {
    if (body.subunitId === null || body.subunitId === "") data.subunitId = null;
    else data.subunitId = cleanText(body.subunitId);
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (Object.keys(data).length === 0) {
    return { ok: false, errors: { _form: "No changes were provided." } };
  }
  return { ok: true, data };
}
