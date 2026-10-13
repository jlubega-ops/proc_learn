/**
 * Fixed-window in-memory rate limiter (single Node process, as deployed in Docker).
 * Keys should combine the action with the caller, e.g. `login:ip:1.2.3.4`.
 */

/** @type {Map<string, { count: number; resetAt: number }>} */
const buckets = new Map();
const MAX_BUCKETS = 50_000;

function sweep(now) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Count one hit. Returns `{ ok: false, retryAfterSeconds }` once `limit` hits occur within `windowMs`.
 * @param {string} key
 * @param {{ limit: number; windowMs: number }} opts
 */
export function hitRateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  sweep(now);
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/** @param {string} key */
export function clearRateLimit(key) {
  buckets.delete(key);
}

export const RATE_LIMIT_MESSAGE = "Too many attempts. Please wait a few minutes and try again.";
