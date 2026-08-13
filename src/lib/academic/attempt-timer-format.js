/**
 * Shared attempt-timer display helpers (safe for client components).
 */

/**
 * @param {number | null | undefined} sec
 */
export function formatDurationClock(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return "—";
  const s = Math.max(0, Math.floor(Number(sec)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * @param {number | null | undefined} sec
 */
export function formatDurationHuman(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return "—";
  const s = Math.max(0, Math.floor(Number(sec)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m ${r}s`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

/**
 * Break remaining seconds into months / days / hours / minutes / seconds.
 * Months use a 30-day approximation for long assessment windows.
 *
 * @param {number | null | undefined} sec
 * @returns {{
 *   months: number;
 *   days: number;
 *   hours: number;
 *   minutes: number;
 *   seconds: number;
 *   totalSeconds: number;
 *   label: string;
 * }}
 */
export function formatCountdownParts(sec) {
  const totalSeconds = Math.max(0, Math.floor(Number(sec) || 0));
  let rem = totalSeconds;
  const months = Math.floor(rem / (30 * 24 * 3600));
  rem -= months * 30 * 24 * 3600;
  const days = Math.floor(rem / (24 * 3600));
  rem -= days * 24 * 3600;
  const hours = Math.floor(rem / 3600);
  rem -= hours * 3600;
  const minutes = Math.floor(rem / 60);
  const seconds = rem % 60;

  /** @type {string[]} */
  const parts = [];
  if (months > 0) parts.push(`${months}mo`);
  if (days > 0 || months > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0 || months > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  parts.push(`${String(seconds).padStart(2, "0")}s`);

  return {
    months,
    days,
    hours,
    minutes,
    seconds,
    totalSeconds,
    label: parts.join(" "),
  };
}

