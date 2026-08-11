import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";

export const runtime = "nodejs";

export async function POST(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (activeRole !== Role.STUDENT) {
    return NextResponse.json({ error: "Only students can unenroll." }, { status: 403 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (String(body?.confirmText || "").trim() !== "UNENROLL") {
    return NextResponse.json(
      { error: 'Unenroll not confirmed. Type "UNENROLL" in all caps to continue.' },
      { status: 400 },
    );
  }

  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!project.requiresEnrollment || project.creatorRole !== Role.EXAMINER) {
    return NextResponse.json({ error: "Project does not support unenroll." }, { status: 400 });
  }

  const enrollment = await prisma.projectEnrollment.findUnique({
    where: { projectId_studentUserId: { projectId: id, studentUserId: user.id } },
  });
  if (!enrollment) {
    return NextResponse.json({ error: "You are not enrolled in this project." }, { status: 400 });
  }

  await prisma.projectEnrollment.delete({ where: { id: enrollment.id } });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_UNENROLLED,
    actorUserId: user.id,
    meta: { projectId: id },
  });

  return NextResponse.json({ ok: true });
}
