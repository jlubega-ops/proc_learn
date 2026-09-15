import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/api/get-session-user";
import { listConfiguredAcademicYears } from "@/lib/academic/academic-context";

export const runtime = "nodejs";

/**
 * Academic years from admin setup only (newest first).
 * `currentLabel` is the year marked isCurrent, else the newest label.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const academicYears = await listConfiguredAcademicYears();
  const current = academicYears.find((y) => y.isCurrent) || academicYears[0] || null;
  const labels = academicYears.map((y) => y.label);

  return NextResponse.json({
    academicYears,
    labels,
    currentLabel: current?.label || null,
    /** @deprecated Prefer `labels` / `currentLabel` — kept for older clients. */
    primary: current?.label ? [current.label] : [],
    extended: labels,
  });
}
