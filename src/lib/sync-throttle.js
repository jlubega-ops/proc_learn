/**
 * Wrap an idempotent "make sure it exists" job so a busy server runs it at most once per `ms`
 * (per key). Concurrent callers share the run in flight; a failed run is retried next call.
 * @template {any[]} A
 * @param {number} ms
 * @param {(...args: A) => Promise<unknown>} run
 * @param {(...args: A) => string} [keyOf]
 * @returns {(...args: A) => Promise<void>}
 */
export function throttleSync(ms, run, keyOf = () => "") {
  /** @type {Map<string, number>} */
  const doneAt = new Map();
  /** @type {Map<string, Promise<void>>} */
  const inFlight = new Map();
  return (...args) => {
    const key = keyOf(...args);
    if (Date.now() - (doneAt.get(key) || 0) < ms) return Promise.resolve();
    const pending = inFlight.get(key);
    if (pending) return pending;
    const p = (async () => {
      try {
        await run(...args);
        doneAt.set(key, Date.now());
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, p);
    return p;
  };
}
