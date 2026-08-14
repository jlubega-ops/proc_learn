import { appAbsoluteUrl } from "@/lib/appConfig";

/**
 * @param {string} rawToken
 */
export function buildActivationUrl(rawToken) {
  return appAbsoluteUrl(`/activate?t=${encodeURIComponent(rawToken)}`);
}

/**
 * @param {string} rawToken
 */
export function buildPasswordResetUrl(rawToken) {
  return appAbsoluteUrl(`/reset-password?t=${encodeURIComponent(rawToken)}`);
}
