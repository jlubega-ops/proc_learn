import { DEFAULT_POST_AUTH_PATH } from "@/lib/appConfig";

/**
 * Prevent open redirects: only same-site relative paths allowed.
 * @param {string | null | undefined} raw
 */
export function safeNextPath(raw) {
  if (!raw || typeof raw !== "string") return DEFAULT_POST_AUTH_PATH;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return DEFAULT_POST_AUTH_PATH;
  if (t.includes("://")) return DEFAULT_POST_AUTH_PATH;
  return t;
}
