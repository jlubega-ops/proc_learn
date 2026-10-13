import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { isProjectMeantForStudent } from "@/lib/academic/student-project-eligibility";
import { checkEnrollmentKey } from "@/lib/academic/project-attempts";

export const runtime = "nodejs";

export async function POST(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (activeRole !== Role.STUDENT) {
    return NextResponse.json({ error: "Only students can enroll." }, { status: 403 });
  }

  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id } });
  if (
    !project ||
    project.creatorRole !== Role.EXAMINER ||
    !project.requiresEnrollment
  ) {
    return NextResponse.json({ error: "Project does not support enrollment." }, { status: 400 });
  }
  if (!project.isPublished) {
    return NextResponse.json({ error: "Project is not published." }, { status: 400 });
  }
  const alreadyJoined = await prisma.projectEnrollment.findUnique({
    where: { projectId_studentUserId: { projectId: id, studentUserId: user.id } },
    select: { id: true },
  });
  if (
    !alreadyJoined &&
    !(await isProjectMeantForStudent(prisma, { projectId: id, studentUserId: user.id }))
  ) {
    return NextResponse.json({ error: "This project is not for your class." }, { status: 403 });
  }
  if (project.openAt && new Date(project.openAt).getTime() > Date.now()) {
    return NextResponse.json(
      { error: "This project is not open yet. Enrollment is not available." },
      { status: 400 },
    );
  }
  if (project.closeAt && new Date(project.closeAt).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "This project is closed. Enrollment is no longer available." },
      { status: 400 },
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (!alreadyJoined) {
    const keyCheck = checkEnrollmentKey(user.id, project, body?.enrollmentAccessKey);
    if (!keyCheck.ok) return NextResponse.json({ error: keyCheck.error }, { status: 400 });
  }

  const enrollment = await prisma.projectEnrollment.upsert({
    where: { projectId_studentUserId: { projectId: id, studentUserId: user.id } },
    create: { projectId: id, studentUserId: user.id },
    update: {},
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ENROLLED,
    actorUserId: user.id,
    meta: { projectId: id },
  });

  return NextResponse.json({ enrollment });
}

