/**
 * @param {unknown} value
 */
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @param {unknown} body
 * @returns {{
 *   ok: true;
 *   data: { name: string; description: string | null; isActive: boolean; parentId: string | null };
 * } | { ok: false; errors: Record<string, string> }}
 */
export function validateProjectOrgDepartmentInput(body) {
  /** @type {Record<string, string>} */
  const errors = {};

  const name = cleanText(body?.name);
  const descriptionRaw = body?.description;
  const description =
    descriptionRaw === undefined || descriptionRaw === null
      ? null
      : cleanText(descriptionRaw) || null;
  const parentIdRaw = body?.parentId ?? body?.parentDepartmentId;
  const parentId =
    parentIdRaw === undefined || parentIdRaw === null || parentIdRaw === ""
      ? null
      : cleanText(parentIdRaw);

  if (!name) errors.name = "Name is required.";
  else if (name.length > 128) errors.name = "Name is too long.";

  if (description && description.length > 512) {
    errors.description = "Description is too long.";
  }

  const isActive = body?.isActive === false ? false : true;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { name, description, isActive, parentId } };
}

/**
 * @param {unknown} body
 */
export function validateProjectOrgDepartmentPatch(body) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<string, unknown>} */
  const data = {};

  if (body?.name !== undefined) {
    const name = cleanText(body.name);
    if (!name) errors.name = "Name is required.";
    else if (name.length > 128) errors.name = "Name is too long.";
    else data.name = name;
  }

  if (body?.description !== undefined) {
    if (body.description === null) data.description = null;
    else {
      const description = cleanText(body.description) || null;
      if (description && description.length > 512) errors.description = "Description is too long.";
      else data.description = description;
    }
  }

  if (body?.isActive !== undefined) {
    data.isActive = body.isActive === false ? false : true;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (Object.keys(data).length === 0) {
    return { ok: false, errors: { _form: "No changes were provided." } };
  }
  return { ok: true, data };
}
