import { APP_BASE_URL } from "@/lib/appConfig";

function base() {
  return APP_BASE_URL.replace(/\/$/, "");
}

/**
 * @param {string} rawToken
 */
export function buildActivationUrl(rawToken) {
  return `${base()}/activate?t=${encodeURIComponent(rawToken)}`;
}

/**
 * @param {string} rawToken
 */
export function buildPasswordResetUrl(rawToken) {
  return `${base()}/reset-password?t=${encodeURIComponent(rawToken)}`;
}
