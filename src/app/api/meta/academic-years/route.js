import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/api/get-session-user";
import { listConfiguredAcademicYears } from "@/lib/academic/academic-context";
import { cachedRead } from "@/lib/server-cache";
import { cachedJson } from "@/lib/api/cached-json";

export const runtime = "nodejs";

/**
 * Academic years from admin setup only (newest first).
 * `currentLabel` is the year marked isCurrent, else the newest label.
 */
export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const academicYears = await cachedRead("academic-years:all", ["AcademicYear"], () =>
    listConfiguredAcademicYears(),
  );
  const current = academicYears.find((y) => y.isCurrent) || academicYears[0] || null;
  const labels = academicYears.map((y) => y.label);

  return cachedJson(request, {
    academicYears,
    labels,
    currentLabel: current?.label || null,
    /** @deprecated Prefer `labels` / `currentLabel` — kept for older clients. */
    primary: current?.label ? [current.label] : [],
    extended: labels,
  }, { revalidate: true });
}
