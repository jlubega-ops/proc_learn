import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/api/get-session-user";
import {
  ensureCurrentAcademicContext,
  getCurrentAcademicContext,
} from "@/lib/academic/academic-context";

export const runtime = "nodejs";

/**
 * Current university academic year.
 * Authenticated users only.
 *
 * Bootstrap note: if the database has no current year,
 * `ensureCurrentAcademicContext` may seed one for empty/dev DBs.
 * That behaviour is development/bootstrap only — production academic years must be created
 * via System Admin → Academic setup.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let context = await getCurrentAcademicContext();
  if (!context.academicYear) {
    context = await ensureCurrentAcademicContext();
  }
  return NextResponse.json(context);
}
