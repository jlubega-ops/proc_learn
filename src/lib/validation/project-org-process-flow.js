import {
  ENGINE_PROCESS_BINDINGS,
  resolveEngineBinding,
} from "@/lib/projects/process-catalogue";

/**
 * @param {unknown} value
 */
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Resolve optional engine binding from create/patch body.
 * `engineEvent` is a triggerKey from ENGINE_PROCESS_BINDINGS, or "" / null to clear.
 *
 * @param {unknown} body
 * @param {{ patch?: boolean }} [opts]
 * @returns {{
 *   ok: true;
 *   apply: boolean;
 *   code: string | null;
 *   triggerKey: string | null;
 * } | { ok: false; errors: Record<string, string> }}
 */
function parseEngineEvent(body, opts = {}) {
  const patch = Boolean(opts.patch);
  if (body?.engineEvent === undefined && body?.triggerKey === undefined) {
    return { ok: true, apply: false, code: null, triggerKey: null };
  }

  const raw =
    body?.engineEvent !== undefined ? body.engineEvent : body?.triggerKey;

  if (raw === null || raw === "") {
    return { ok: true, apply: true, code: null, triggerKey: null };
  }

  const key = cleanText(raw);
  if (!key) {
    return { ok: true, apply: true, code: null, triggerKey: null };
  }

  const binding = resolveEngineBinding(key);
  if (!binding) {
    return {
      ok: false,
      errors: {
        engineEvent:
          "Choose a known engine event, or leave unbound for educational processes.",
      },
    };
  }

  return {
    ok: true,
    apply: true,
    code: binding.code,
    triggerKey: binding.triggerKey,
  };
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

  const engine = parseEngineEvent(body);
  if (!engine.ok) Object.assign(errors, engine.errors);

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      name,
      description,
      code: engine.apply ? engine.code : null,
      triggerKey: engine.apply ? engine.triggerKey : null,
    },
    engineBindings: ENGINE_PROCESS_BINDINGS,
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

  const engine = parseEngineEvent(body, { patch: true });
  if (!engine.ok) Object.assign(errors, engine.errors);
  else if (engine.apply) {
    data.code = engine.code;
    data.triggerKey = engine.triggerKey;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (Object.keys(data).length === 0) {
    return { ok: false, errors: { _form: "No changes were provided." } };
  }

  return { ok: true, data };
}

export { ENGINE_PROCESS_BINDINGS };
