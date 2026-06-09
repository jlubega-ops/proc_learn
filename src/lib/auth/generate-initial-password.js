import crypto from "node:crypto";

/** Readable charset — excludes 0/O, 1/I/l for email clarity. */
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/**
 * @param {number} [length=12]
 * @returns {string}
 */
export function generateInitialPassword(length = 12) {
  const n = Math.max(10, Math.min(24, length));
  const bytes = crypto.randomBytes(n);
  let out = "";
  for (let i = 0; i < n; i += 1) {
    out += CHARSET[bytes[i] % CHARSET.length];
  }
  return out;
}
