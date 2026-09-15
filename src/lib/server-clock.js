/**
 * Server-authoritative clock helpers.
 * Client UIs must sync from API `serverNow` (ISO) and never treat the device clock
 * as source of truth for deadlines, "time left", or open/closed windows.
 */

/**
 * @param {unknown} iso
 * @returns {number | null}
 */
export function parseServerInstantMs(iso) {
  if (iso == null || iso === "") return null;
  const ms = new Date(/** @type {string | Date} */ (iso)).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Skew so that: estimatedServerNow ≈ Date.now() + skewMs
 * @param {unknown} serverNowIso
 * @param {number} [clientNowMs]
 */
export function computeClockSkewMs(serverNowIso, clientNowMs = Date.now()) {
  const serverMs = parseServerInstantMs(serverNowIso);
  if (serverMs == null) return 0;
  return serverMs - clientNowMs;
}

/**
 * @param {number} skewMs
 * @param {number} [clientNowMs]
 */
export function estimatedServerNowMs(skewMs, clientNowMs = Date.now()) {
  return clientNowMs + (Number.isFinite(skewMs) ? skewMs : 0);
}

/**
 * Remaining whole seconds until an absolute deadline, using server-synced now.
 * @param {unknown} deadlineAtIso
 * @param {number} skewMs
 * @param {number} [clientNowMs]
 */
export function remainingSecondsUntilDeadline(deadlineAtIso, skewMs, clientNowMs = Date.now()) {
  const deadlineMs = parseServerInstantMs(deadlineAtIso);
  if (deadlineMs == null) return null;
  return Math.max(0, Math.floor((deadlineMs - estimatedServerNowMs(skewMs, clientNowMs)) / 1000));
}

/**
 * Resolve a countdown deadline from a timer payload that includes serverNow.
 * Prefers absolute deadlineAt; falls back to remainingSeconds anchored to serverNow.
 *
 * @param {{
 *   serverNow?: string | null;
 *   deadlineAt?: string | null;
 *   remainingSeconds?: number | null;
 * } | null | undefined} timer
 * @param {number} [clientNowMs]
 * @returns {{ skewMs: number; deadlineMs: number | null; remainingSeconds: number | null }}
 */
export function resolveTimerCountdown(timer, clientNowMs = Date.now()) {
  const skewMs = computeClockSkewMs(timer?.serverNow, clientNowMs);
  const deadlineFromAt = parseServerInstantMs(timer?.deadlineAt);

  if (deadlineFromAt != null) {
    return {
      skewMs,
      deadlineMs: deadlineFromAt,
      remainingSeconds: Math.max(
        0,
        Math.floor((deadlineFromAt - estimatedServerNowMs(skewMs, clientNowMs)) / 1000),
      ),
    };
  }

  if (typeof timer?.remainingSeconds === "number" && Number.isFinite(timer.remainingSeconds)) {
    const remaining = Math.max(0, Math.floor(timer.remainingSeconds));
    const serverMs = parseServerInstantMs(timer?.serverNow) ?? clientNowMs + skewMs;
    return {
      skewMs,
      deadlineMs: serverMs + remaining * 1000,
      remainingSeconds: remaining,
    };
  }

  return { skewMs, deadlineMs: null, remainingSeconds: null };
}

/**
 * Window open/closed relative to server time (not device clock).
 * @param {{ openAt?: string | Date | null; closeAt?: string | Date | null }} row
 * @param {number} nowMs server-synced instant
 * @returns {"NOT_YET" | "OPEN" | "CLOSED"}
 */
export function computeWindowOpenState(row, nowMs) {
  const openAt = parseServerInstantMs(row?.openAt);
  const closeAt = parseServerInstantMs(row?.closeAt);
  if (openAt != null && nowMs < openAt) return "NOT_YET";
  if (closeAt != null && nowMs > closeAt) return "CLOSED";
  return "OPEN";
}
