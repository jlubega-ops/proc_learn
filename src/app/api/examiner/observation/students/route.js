import { NextResponse } from "next/server";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canObserveStudentOrganisation } from "@/lib/academic/examiner-observation-access";
import { listExaminerObservationStudents } from "@/lib/academic/examiner-observation";

export const runtime = "nodejs";

/**
 * Examiner Scenario A roster — defaults to current Academic Year.
 * Query: q, academicYearId, participation=all|students|demo
 */
export async function GET(request) {
  const actor = await getSessionUser();
  const active = sessionActiveRole(actor);
  if (!actor || !canObserveStudentOrganisation({ activeRole: active })) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q") || "";
  const academicYearId = searchParams.get("academicYearId") || null;
  const participationRaw = (searchParams.get("participation") || "all").trim();
  const participation =
    participationRaw === "students" || participationRaw === "demo" ? participationRaw : "all";

  const data = await listExaminerObservationStudents({
    q,
    academicYearId,
    participation,
  });

  return NextResponse.json(data);
}
