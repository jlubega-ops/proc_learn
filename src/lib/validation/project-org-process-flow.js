/**
 * @param {unknown} value
 */
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @param {unknown} body
 */
export function validateProjectOrgProcessFlowInput(body) {
  /** @type {Record<string, string>} */
  const errors = {};

  const name = cleanText(body?.name);
  if (!name) errors.name = "Process name is required.";
  else if (name.length > 128) errors.name = "Process name must be 128 characters or fewer.";

  let description = null;
  if (body?.description !== undefined && body?.description !== null && body?.description !== "") {
    const desc = cleanText(body.description);
    if (desc.length > 512) errors.description = "Description must be 512 characters or fewer.";
    else description = desc || null;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: { name, description },
  };
}

/**
 * @param {unknown} body
 */
export function validateProjectOrgProcessFlowPatch(body) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<string, unknown>} */
  const data = {};

  if (body?.name !== undefined) {
    const name = cleanText(body.name);
    if (!name) errors.name = "Process name is required.";
    else if (name.length > 128) errors.name = "Process name must be 128 characters or fewer.";
    else data.name = name;
  }

  if (body?.description !== undefined) {
    if (body.description === null || body.description === "") {
      data.description = null;
    } else {
      const desc = cleanText(body.description);
      if (desc.length > 512) errors.description = "Description must be 512 characters or fewer.";
      else data.description = desc || null;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (Object.keys(data).length === 0) {
    return { ok: false, errors: { _form: "No changes were provided." } };
  }

  return { ok: true, data };
}
