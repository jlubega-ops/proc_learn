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
  const providedKey = String(body?.enrollmentAccessKey || "").trim().toUpperCase();
  if (project.enrollmentKey) {
    if (!providedKey) {
      return NextResponse.json({ error: "Enrollment key is required for this project." }, { status: 400 });
    }
    if (providedKey !== String(project.enrollmentKey).toUpperCase()) {
      return NextResponse.json({ error: "Invalid enrollment key." }, { status: 400 });
    }
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

