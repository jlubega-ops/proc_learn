/**
 * @param {unknown} value
 */
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @param {unknown} value
 */
function parseStepNumber(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.trim());
    if (Number.isInteger(n)) return n;
  }
  return null;
}

/**
 * @param {unknown} body
 */
export function validateProjectOrgProcessFlowItemInput(body) {
  /** @type {Record<string, string>} */
  const errors = {};

  const stepNumber = parseStepNumber(body?.stepNumber);
  if (stepNumber === null) errors.stepNumber = "Process step number is required.";
  else if (stepNumber < 1) errors.stepNumber = "Process step must be at least 1.";
  else if (stepNumber > 9999) errors.stepNumber = "Process step must be 9999 or fewer.";

  const taskDescription = cleanText(body?.taskDescription);
  if (!taskDescription) errors.taskDescription = "Task description is required.";
  else if (taskDescription.length > 512) {
    errors.taskDescription = "Task description must be 512 characters or fewer.";
  }

  const projectOrgRoleId = cleanText(body?.projectOrgRoleId);
  if (!projectOrgRoleId) errors.projectOrgRoleId = "Required user role is required.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      stepNumber,
      taskDescription,
      projectOrgRoleId,
    },
  };
}

/**
 * @param {unknown} body
 */
export function validateProjectOrgProcessFlowItemPatch(body) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<string, unknown>} */
  const data = {};

  if (body?.stepNumber !== undefined) {
    const stepNumber = parseStepNumber(body.stepNumber);
    if (stepNumber === null) errors.stepNumber = "Process step number is required.";
    else if (stepNumber < 1) errors.stepNumber = "Process step must be at least 1.";
    else if (stepNumber > 9999) errors.stepNumber = "Process step must be 9999 or fewer.";
    else data.stepNumber = stepNumber;
  }

  if (body?.taskDescription !== undefined) {
    const taskDescription = cleanText(body.taskDescription);
    if (!taskDescription) errors.taskDescription = "Task description is required.";
    else if (taskDescription.length > 512) {
      errors.taskDescription = "Task description must be 512 characters or fewer.";
    } else data.taskDescription = taskDescription;
  }

  if (body?.projectOrgRoleId !== undefined) {
    const projectOrgRoleId = cleanText(body.projectOrgRoleId);
    if (!projectOrgRoleId) errors.projectOrgRoleId = "Required user role is required.";
    else data.projectOrgRoleId = projectOrgRoleId;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (Object.keys(data).length === 0) {
    return { ok: false, errors: { _form: "No changes were provided." } };
  }

  return { ok: true, data };
}
