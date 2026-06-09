/** Session flag — suppress error toasts while tearing down the signed-in shell. */
export const SIGNING_OUT_STORAGE_KEY = "pl_signing_out";

/** Optional toast to show on the next page after redirect (JSON). */
export const POST_AUTH_TOAST_STORAGE_KEY = "pl_post_auth_toast";

/**
 * @param {boolean} active
 */
export function setClientSigningOutFlag(active) {
  try {
    if (active) {
      sessionStorage.setItem(SIGNING_OUT_STORAGE_KEY, "1");
    } else {
      sessionStorage.removeItem(SIGNING_OUT_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * @returns {boolean}
 */
export function isClientSigningOut() {
  try {
    return sessionStorage.getItem(SIGNING_OUT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * @param {{ message: string; severity?: 'success' | 'error'; duration?: number }} toast
 */
export function queuePostAuthToast(toast) {
  try {
    sessionStorage.setItem(POST_AUTH_TOAST_STORAGE_KEY, JSON.stringify(toast));
  } catch {
    /* ignore */
  }
}

export function consumePostAuthToast() {
  try {
    const raw = sessionStorage.getItem(POST_AUTH_TOAST_STORAGE_KEY);
    sessionStorage.removeItem(POST_AUTH_TOAST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.message !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}
