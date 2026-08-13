import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { canManageExaminerProject } from "@/lib/projects/access";
import { getExaminerAcademicProjectStudentReport } from "@/lib/academic/examiner-project-student-report";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";

/**
 * Read-only report for one enrolled student on this academic project.
 */
export async function GET(request, context) {
  const actor = await getSessionUser();
  if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(actor) || Role.STUDENT;

  const params = await context.params;
  const id = String(params?.id || "").trim();
  const studentId = String(params?.studentId || "").trim();
  if (!id || !studentId) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.isPersonalOrg || project.isAttemptOrg) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!canManageExaminerProject({ activeRole, project, userId: actor.id })) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const academicYearId = request.nextUrl.searchParams.get("academicYearId") || null;

  try {
    const data = await getExaminerAcademicProjectStudentReport({
      academicProjectId: id,
      studentUserId: studentId,
      academicYearId,
    });

    await writeAuditLog({
      eventType: AuditEvent.EXAMINER_STUDENT_OBSERVED,
      actorUserId: actor.id,
      targetUserId: studentId,
      meta: {
        mode: "ACADEMIC_PROJECT_STUDENT_REPORT",
        readOnly: true,
        projectId: id,
        workspaceProjectId: data.organisation?.projectId || null,
      },
    });

    return NextResponse.json(data);
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? e.code : "";
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not load student report." }, { status: 500 });
  }
}
