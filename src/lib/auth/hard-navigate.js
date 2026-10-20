import { queuePostAuthToast } from "@/lib/auth/client-sign-out";
import { safeNextPath } from "@/lib/auth/safe-next-path";

/**
 * Full document navigation after an identity change (login, role switch, leave student mode).
 * Avoids App Router soft-nav hangs waiting on nested RSC/session work.
 *
 * @param {string | null | undefined} path
 * @param {{
 *   toast?: { message: string; severity?: "success" | "error"; duration?: number };
 *   history?: "replace" | "push";
 * }} [opts]
 */
export function hardNavigate(path, opts = {}) {
  const dest = safeNextPath(path);
  if (opts.toast?.message) {
    queuePostAuthToast(opts.toast);
  }
  if (typeof window === "undefined") return;
  if (opts.history === "push") {
    window.location.assign(dest);
    return;
  }
  window.location.replace(dest);
}
