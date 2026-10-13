const PREFIX = "proc-learn:draft:";
/** Drafts older than this are dropped (abandoned forms must not pile up in the browser). */
export const FORM_DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function key(formKey) {
  return `${PREFIX}${formKey}`;
}

let pruned = false;

/** Drop expired drafts once per page load (cheap: only our own keys). */
function pruneExpiredOnce() {
  if (pruned || typeof window === "undefined") return;
  pruned = true;
  try {
    const now = Date.now();
    const stale = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(k) || "null");
        const savedAt = parsed && typeof parsed === "object" ? Number(parsed.savedAt) : NaN;
        if (!Number.isFinite(savedAt) || now - savedAt > FORM_DRAFT_TTL_MS) stale.push(k);
      } catch {
        stale.push(k);
      }
    }
    for (const k of stale) window.localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Persist partial form state locally (survives refresh, crash, power loss and browser restart).
 * Debounce writes in the UI to avoid jank.
 * @param {string} formKey stable id per form, scoped to the signed-in identity
 * @param {unknown} data JSON-serializable
 */
export function saveFormDraft(formKey, data) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(formKey), JSON.stringify({ v: 1, savedAt: Date.now(), data }));
  } catch {
    /* quota / private mode */
  }
}

/** @param {string} formKey */
export function loadFormDraft(formKey) {
  if (typeof window === "undefined") return null;
  pruneExpiredOnce();
  try {
    const raw = window.localStorage.getItem(key(formKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.v === 1 && "data" in parsed) {
      if (Date.now() - Number(parsed.savedAt) > FORM_DRAFT_TTL_MS) {
        window.localStorage.removeItem(key(formKey));
        return null;
      }
      return parsed.data;
    }
    return parsed;
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

/**
 * Draft scope for the signed-in identity so shared lab computers never show one user's
 * draft to another. Null while the session is unknown (do not persist yet).
 * @param {{ authenticated?: boolean; userId?: string; orgUserId?: string } | null | undefined} session
 */
export function formDraftScope(session) {
  if (!session?.authenticated) return null;
  if (session.orgUserId) return `org:${session.orgUserId}`;
  if (session.userId) return `user:${session.userId}`;
  return null;
}
