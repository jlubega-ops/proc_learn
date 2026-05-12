const PREFIX = "proc-learn:draft:";

function key(formKey) {
  return `${PREFIX}${formKey}`;
}

/**
 * Persist partial form state locally (offline / refresh). Debounce writes in the UI to avoid jank.
 * @param {string} formKey stable id per form (e.g. "course-enroll:step-2")
 * @param {unknown} data JSON-serializable
 */
export function saveFormDraft(formKey, data) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(formKey), JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

/** @param {string} formKey */
export function loadFormDraft(formKey) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(formKey));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** @param {string} formKey */
export function clearFormDraft(formKey) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(formKey));
  } catch {
    /* ignore */
  }
}
