import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/api/get-session-user";
import {
  holidayYearsAround,
  loadUgandaPublicHolidaySet,
  PUBLIC_HOLIDAY_COUNTRY,
} from "@/lib/projects/uganda-public-holidays";

export const runtime = "nodejs";

/**
 * Uganda public holidays for timetable working-day math.
 * Proxies Nager.Date; on failure returns empty dates (weekends-only fallback).
 *
 * GET ?years=2026,2027  or  ?around=2026-10-20
 */
export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const yearsParam = String(url.searchParams.get("years") || "").trim();
  const around = String(url.searchParams.get("around") || "").trim();

  let years = yearsParam
    ? yearsParam
        .split(",")
        .map((y) => Number(y.trim()))
        .filter((y) => Number.isFinite(y))
    : holidayYearsAround(around || null);

  const loaded = await loadUgandaPublicHolidaySet(years);
  return NextResponse.json({
    country: PUBLIC_HOLIDAY_COUNTRY,
    years: loaded.years,
    dates: [...loaded.dates].sort(),
    source: loaded.source,
    /** true when real holiday dates were applied */
    holidaysApplied: loaded.dates.size > 0 && loaded.source !== "fallback",
  });
}
