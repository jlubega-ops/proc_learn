import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/api/get-session-user";
import {
  ensureCurrentAcademicContext,
  getCurrentAcademicContext,
} from "@/lib/academic/academic-context";
import { cachedRead } from "@/lib/server-cache";
import { cachedJson } from "@/lib/api/cached-json";

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
export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let context = await cachedRead("academic-context:current", ["AcademicYear"], () =>
    getCurrentAcademicContext(),
  );
  if (!context.academicYear && process.env.NODE_ENV !== "production") {
    context = await ensureCurrentAcademicContext();
  }
  return cachedJson(request, context, { revalidate: true });
}
