import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { startProjectAttempt } from "@/lib/academic/project-attempts";
import { prisma } from "@/lib/prisma";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";

/**
 * Auto-enroll (membership) then start / resume a ProjectAttempt.
 * Body: { enrollmentAccessKey?: string }
 */
export async function POST(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (sessionActiveRole(user) !== Role.STUDENT) {
    return NextResponse.json({ error: "Only students can start attempts." }, { status: 403 });
  }

  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.isPersonalOrg || project.isAttemptOrg) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const before = await prisma.projectEnrollment.findUnique({
      where: { projectId_studentUserId: { projectId: id, studentUserId: user.id } },
    });

    const result = await startProjectAttempt({
      projectId: id,
      studentUserId: user.id,
      actorUserId: user.id,
      enrollmentAccessKey: body?.enrollmentAccessKey,
    });
    if (!before) {
      await writeAuditLog({
        eventType: AuditEvent.PROJECT_ENROLLED,
        actorUserId: user.id,
        meta: { projectId: id, mode: "auto_on_start" },
      });
    }

    return NextResponse.json({
      ok: true,
      ...result,
      enrollment: result.enrollment,
      redirectTo: "/organisation",
    });
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? e.code : "";
    const message = e instanceof Error ? e.message : "Could not start attempt.";
    const status =
      code === "NOT_FOUND"
        ? 404
        : code === "MAX_ATTEMPTS" ||
            code === "WINDOW_CLOSED" ||
            code === "NOT_PUBLISHED" ||
            code === "NOT_ACADEMIC" ||
            code === "NO_ORG" ||
            code === "NOT_ELIGIBLE" ||
            code === "ENROLLMENT_KEY" ||
            code === "ASSESSMENT_LOCKED" || code === "PROJECT_IN_PROGRESS"
          ? 400
          : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: message }, { status });
  }
}
