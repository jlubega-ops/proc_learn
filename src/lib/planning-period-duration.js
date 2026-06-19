import { addDays, differenceInCalendarDays, intervalToDuration } from "date-fns";

/**
 * @param {number} count
 * @param {string} singular
 * @param {string} plural
 */
function pluralUnit(count, singular, plural) {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

/**
 * Human-readable inclusive duration between two calendar dates
 * (e.g. "2 weeks", "1 week and 4 days", "1 year and 8 months", "4 months").
 * @param {Date | null | undefined} startDate
 * @param {Date | null | undefined} endDate
 */
export function formatPlanningPeriodDuration(startDate, endDate) {
  if (!startDate || !endDate) return "—";
  const inclusiveDays = differenceInCalendarDays(endDate, startDate) + 1;
  if (inclusiveDays <= 0) return "—";

  const duration = intervalToDuration({
    start: startDate,
    end: addDays(endDate, 1),
  });

  const years = duration.years ?? 0;
  const months = duration.months ?? 0;
  let weeks = duration.weeks ?? 0;
  let days = duration.days ?? 0;

  if (years === 0 && months === 0) {
    weeks += Math.floor(days / 7);
    days %= 7;
  }

  /** @type {string[]} */
  const parts = [];
  if (years) parts.push(pluralUnit(years, "year", "years"));
  if (months) parts.push(pluralUnit(months, "month", "months"));
  if (weeks) parts.push(pluralUnit(weeks, "week", "weeks"));
  if (days) parts.push(pluralUnit(days, "day", "days"));

  return parts.length ? parts.join(" and ") : "—";
}
