import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import {
  getStudentAcademicContext,
  joinCurrentAcademicYear,
} from "@/lib/academic/student-enrollment";

export const runtime = "nodejs";

/**
 * Join the university current Academic Year.
 * Preserves previous enrollments as historical. Idempotent if already enrolled.
 */
export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (sessionActiveRole(user) !== Role.STUDENT) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!user.studentProfile) {
    return NextResponse.json({ error: "Student profile required." }, { status: 403 });
  }

  let body = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const confirm = body?.confirm;
  if (confirm === false) {
    return NextResponse.json({ error: "Join was not confirmed." }, { status: 400 });
  }

  try {
    const result = await joinCurrentAcademicYear(user.id, { actorUserId: user.id });
    const context = await getStudentAcademicContext(user.id);

    if (!result.alreadyActive) {
      const prev = result.previousActive;
      if (prev && prev.academicYearId !== result.enrollment?.academicYearId) {
        await writeAuditLog({
          eventType: AuditEvent.STUDENT_ACADEMIC_ENROLLMENT_MARKED_HISTORICAL,
          actorUserId: user.id,
          targetUserId: user.id,
          meta: {
            enrollmentId: prev.id,
            academicYearId: prev.academicYearId,
            label: prev.academicYear?.label || null,
          },
        });
      }

      if (result.created) {
        await writeAuditLog({
          eventType: AuditEvent.STUDENT_ACADEMIC_ENROLLMENT_CREATED,
          actorUserId: user.id,
          targetUserId: user.id,
          meta: {
            enrollmentId: result.enrollment?.id,
            academicYearId: result.enrollment?.academicYearId,
            label: result.academicYear?.label,
          },
        });
      }

      await writeAuditLog({
        eventType: AuditEvent.STUDENT_ACADEMIC_ENROLLMENT_JOINED_YEAR,
        actorUserId: user.id,
        targetUserId: user.id,
        meta: {
          enrollmentId: result.enrollment?.id,
          academicYearId: result.enrollment?.academicYearId,
          label: result.academicYear?.label,
          previousEnrollmentId: prev?.id || null,
          reactivated: Boolean(result.reactivated),
          orgAcademicSlateId: result.orgAcademicSlate?.id || null,
        },
      });

      if (result.slateCreated && result.orgAcademicSlate?.id) {
        await writeAuditLog({
          eventType: AuditEvent.ORG_ACADEMIC_SLATE_CREATED,
          actorUserId: user.id,
          targetUserId: user.id,
          meta: {
            orgAcademicSlateId: result.orgAcademicSlate.id,
            projectId: result.orgAcademicSlate.projectId,
            enrollmentId: result.orgAcademicSlate.enrollmentId,
            academicYearId: result.orgAcademicSlate.academicYearId,
            academicYearLabel: result.orgAcademicSlate.academicYear?.label || null,
          },
        });
      } else if (result.orgAcademicSlate?.id && prev) {
        await writeAuditLog({
          eventType: AuditEvent.ORG_ACADEMIC_SLATE_MARKED_HISTORICAL,
          actorUserId: user.id,
          targetUserId: user.id,
          meta: {
            note: "Prior current slate closed when joining a new academic year",
            enrollmentId: result.enrollment?.id,
            orgAcademicSlateId: result.orgAcademicSlate.id,
          },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      alreadyEnrolled: Boolean(result.alreadyActive),
      enrollment: result.enrollment,
      context,
    });
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? e.code : "";
    if (code === "NO_CURRENT_YEAR") {
      return NextResponse.json(
        {
          error:
            "No current academic year is configured. Please contact a system administrator.",
        },
        { status: 409 },
      );
    }
    if (code === "NOT_STUDENT") {
      return NextResponse.json(
        { error: "Only students can join an academic year." },
        { status: 403 },
      );
    }
    console.error(e);
    return NextResponse.json({ error: "Could not join the academic year." }, { status: 500 });
  }
}
