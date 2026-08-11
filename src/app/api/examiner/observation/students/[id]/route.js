import { NextResponse } from "next/server";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canObserveStudentOrganisation } from "@/lib/academic/examiner-observation-access";
import { getExaminerStudentObservation } from "@/lib/academic/examiner-observation";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

/**
 * Read-only Scenario A observation payload for one student / demo participant.
 */
export async function GET(request, context) {
  const actor = await getSessionUser();
  const active = sessionActiveRole(actor);
  if (!actor || !canObserveStudentOrganisation({ activeRole: active })) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const id = typeof params?.id === "string" ? params.id : "";
  if (!id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const academicYearId = request.nextUrl.searchParams.get("academicYearId") || null;

  try {
    const data = await getExaminerStudentObservation(id, { academicYearId });

    await writeAuditLog({
      eventType: AuditEvent.EXAMINER_STUDENT_OBSERVED,
      actorUserId: actor.id,
      targetUserId: id,
      meta: {
        mode: "SCENARIO_A_OBSERVE",
        readOnly: true,
        academicYearId: data.academic?.selectedYearId || null,
        enrollmentId: data.academic?.enrollment?.id || null,
        projectId: data.organisation?.projectId || null,
        participationType: data.academic?.enrollment?.participationType || null,
        effectiveRole: active,
      },
    });

    return NextResponse.json(data);
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? e.code : "";
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not load observation." }, { status: 500 });
  }
}
