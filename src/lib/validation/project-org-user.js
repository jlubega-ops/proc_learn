/**
 * @param {unknown} value
 */
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @param {string} value
 * @param {"First" | "Last"} label
 */
function nameError(value, label) {
  if (!value) return `${label} name is required.`;
  if (value.length > 100) return `${label} name is too long.`;
  if (!/[a-z0-9]/i.test(value)) return `${label} name needs letters.`;
  return null;
}

/**
 * Create payload — login email is generated server-side from first + last name.
 * @param {unknown} body
 * @returns {{
 *   ok: true;
 *   data: {
 *     firstName: string;
 *     lastName: string;
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
  const lastName = cleanText(body?.lastName);
  const projectOrgRoleId = cleanText(body?.projectOrgRoleId);
  const departmentId = cleanText(body?.departmentId);
  const subunitIdRaw = body?.subunitId;
  const subunitId =
    subunitIdRaw === undefined || subunitIdRaw === null || subunitIdRaw === ""
      ? null
      : cleanText(subunitIdRaw);

  const firstErr = nameError(firstName, "First");
  if (firstErr) errors.firstName = firstErr;
  const lastErr = nameError(lastName, "Last");
  if (lastErr) errors.lastName = lastErr;

  if (!projectOrgRoleId) errors.projectOrgRoleId = "Role is required.";
  if (!departmentId) errors.departmentId = "Department is required.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: { firstName, lastName, projectOrgRoleId, departmentId, subunitId },
  };
}

/**
 * Patch payload — login email follows the name and is regenerated server-side.
 * @param {unknown} body
 */
export function validateProjectOrgUserPatch(body) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<string, unknown>} */
  const data = {};

  if (body?.firstName !== undefined) {
    const firstName = cleanText(body.firstName);
    const err = nameError(firstName, "First");
    if (err) errors.firstName = err;
    else data.firstName = firstName;
  }

  if (body?.lastName !== undefined) {
    const lastName = cleanText(body.lastName);
    const err = nameError(lastName, "Last");
    if (err) errors.lastName = err;
    else data.lastName = lastName;
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
