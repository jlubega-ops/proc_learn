import { differenceInCalendarDays } from "date-fns";

/**
 * Human-readable inclusive duration between two calendar dates.
 * @param {Date | null | undefined} startDate
 * @param {Date | null | undefined} endDate
 */
export function formatPlanningPeriodDuration(startDate, endDate) {
  if (!startDate || !endDate) return "—";
  const days = differenceInCalendarDays(endDate, startDate) + 1;
  if (days <= 0) return "—";
  if (days % 365 === 0) {
    const years = days / 365;
    return years === 1 ? "1 year" : `${years} years`;
  }
  if (days % 7 === 0) {
    const weeks = days / 7;
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }
  return days === 1 ? "1 day" : `${days} days`;
}
