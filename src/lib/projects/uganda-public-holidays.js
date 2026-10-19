/**
 * Uganda public holidays via Nager.Date (free, no API key).
 * https://date.nager.at/api/v3/PublicHolidays/{year}/UG
 *
 * On any failure: return empty set so timetable falls back to weekends-only.
 */

export const PUBLIC_HOLIDAY_COUNTRY = "UG";
export const NAGER_PUBLIC_HOLIDAYS_BASE = "https://date.nager.at/api/v3/PublicHolidays";

/** @type {Map<string, { dates: Set<string>; fetchedAt: number; source: "api" | "fallback" }>} */
const memoryCache = new Map();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

/**
 * @param {number} year
 */
function cacheKey(year) {
  return `${PUBLIC_HOLIDAY_COUNTRY}:${year}`;
}

/**
 * @param {unknown} row
 * @returns {boolean}
 */
function isPublicType(row) {
  const types = Array.isArray(/** @type {any} */ (row)?.types)
    ? /** @type {any} */ (row).types
    : [];
  if (!types.length) return true;
  return types.some((t) => String(t).toLowerCase() === "public");
}

/**
 * @param {unknown} payload
 * @returns {Set<string>}
 */
export function holidayDatesFromNagerPayload(payload) {
  /** @type {Set<string>} */
  const dates = new Set();
  if (!Array.isArray(payload)) return dates;
  for (const row of payload) {
    if (!isPublicType(row)) continue;
    const d = String(/** @type {any} */ (row)?.date || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dates.add(d);
  }
  return dates;
}

/**
 * @param {number} year
 * @returns {Promise<{ dates: Set<string>; source: "api" | "fallback"; year: number }>}
 */
export async function fetchUgandaPublicHolidaysForYear(year) {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1990 || y > 2100) {
    return { dates: new Set(), source: "fallback", year: y };
  }

  const key = cacheKey(y);
  const hit = memoryCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return { dates: hit.dates, source: hit.source, year: y };
  }

  const url = `${NAGER_PUBLIC_HOLIDAYS_BASE}/${y}/${PUBLIC_HOLIDAY_COUNTRY}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      // Allow Next fetch cache when available; ignore if unsupported.
      next: { revalidate: 86400 },
    });
    clearTimeout(timer);
    if (!res.ok) {
      memoryCache.set(key, { dates: new Set(), fetchedAt: Date.now(), source: "fallback" });
      return { dates: new Set(), source: "fallback", year: y };
    }
    const json = await res.json();
    const dates = holidayDatesFromNagerPayload(json);
    memoryCache.set(key, { dates, fetchedAt: Date.now(), source: "api" });
    return { dates, source: "api", year: y };
  } catch {
    memoryCache.set(key, { dates: new Set(), fetchedAt: Date.now(), source: "fallback" });
    return { dates: new Set(), source: "fallback", year: y };
  }
}

/**
 * Load holiday date strings for one or more years (merged).
 * Never throws — empty set on total failure.
 *
 * @param {number[]} years
 * @returns {Promise<{ dates: Set<string>; source: "api" | "fallback" | "mixed"; years: number[] }>}
 */
export async function loadUgandaPublicHolidaySet(years) {
  const uniq = [...new Set((years || []).map((y) => Number(y)).filter((y) => Number.isFinite(y)))];
  if (!uniq.length) {
    const y = new Date().getFullYear();
    uniq.push(y, y + 1);
  }

  const results = await Promise.all(uniq.map((y) => fetchUgandaPublicHolidaysForYear(y)));
  /** @type {Set<string>} */
  const dates = new Set();
  let api = 0;
  let fallback = 0;
  for (const r of results) {
    for (const d of r.dates) dates.add(d);
    if (r.source === "api") api += 1;
    else fallback += 1;
  }
  const source = api && !fallback ? "api" : !api && fallback ? "fallback" : api ? "mixed" : "fallback";
  return { dates, source, years: uniq };
}

/**
 * Years to cover for timetable math around a date / today.
 * @param {string | Date | null | undefined} around
 * @returns {number[]}
 */
export function holidayYearsAround(around) {
  const base =
    around instanceof Date && !Number.isNaN(around.getTime())
      ? around.getFullYear()
      : (() => {
          const t = String(around || "").trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return Number(t.slice(0, 4));
          return new Date().getFullYear();
        })();
  return [base - 1, base, base + 1, base + 2];
}
