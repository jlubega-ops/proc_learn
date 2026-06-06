/**
 * @param {unknown} body
 * @returns {{ ok: true; data: { name: string; description: string | null; sortOrder: number; isActive: boolean } } | { ok: false; errors: Record<string, string> }}
 */
export function validateProjectOrgRoleInput(body) {
  /** @type {Record<string, string>} */
  const errors = {};

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) errors.name = "Role name is required.";
  else if (name.length > 128) errors.name = "Role name must be 128 characters or fewer.";

  let description = null;
  if (body?.description !== undefined && body?.description !== null) {
    const d = typeof body.description === "string" ? body.description.trim() : "";
    if (d.length > 512) errors.description = "Description must be 512 characters or fewer.";
    else description = d || null;
  }

  let sortOrder = 0;
  if (body?.sortOrder !== undefined && body?.sortOrder !== null) {
    const n = Number(body.sortOrder);
    if (!Number.isInteger(n) || n < 0 || n > 9999) {
      errors.sortOrder = "Sort order must be a whole number from 0 to 9999.";
    } else {
      sortOrder = n;
    }
  }

  const isActive = body?.isActive === false ? false : true;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name,
      description,
      sortOrder,
      isActive,
    },
  };
}

/**
 * Partial update — only validates fields present in body.
 * @param {unknown} body
 * @returns {{ ok: true; data: Record<string, unknown> } | { ok: false; errors: Record<string, string> }}
 */
export function validateProjectOrgRolePatch(body) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<string, unknown>} */
  const data = {};

  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) errors.name = "Role name is required.";
    else if (name.length > 128) errors.name = "Role name must be 128 characters or fewer.";
    else data.name = name;
  }

  if (body?.description !== undefined) {
    if (body.description === null) {
      data.description = null;
    } else {
      const d = typeof body.description === "string" ? body.description.trim() : "";
      if (d.length > 512) errors.description = "Description must be 512 characters or fewer.";
      else data.description = d || null;
    }
  }

  if (body?.sortOrder !== undefined && body?.sortOrder !== null) {
    const n = Number(body.sortOrder);
    if (!Number.isInteger(n) || n < 0 || n > 9999) {
      errors.sortOrder = "Sort order must be a whole number from 0 to 9999.";
    } else {
      data.sortOrder = n;
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
