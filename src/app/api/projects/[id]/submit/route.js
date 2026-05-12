import { NextResponse } from "next/server";
import { ProjectEnrollmentStatus, ProjectStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";

export const runtime = "nodejs";

export async function POST(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (activeRole !== Role.STUDENT) {
    return NextResponse.json({ error: "Only students can submit projects." }, { status: 403 });
  }

  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  if (project.ownerUserId === user.id) {
    const updated = await prisma.project.update({
      where: { id },
      data: { status: ProjectStatus.COMPLETED },
    });
    await writeAuditLog({
      eventType: AuditEvent.PROJECT_SUBMITTED,
      actorUserId: user.id,
      meta: { projectId: id, mode: "own_project" },
    });
    return NextResponse.json({ project: updated });
  }

  const enrollment = await prisma.projectEnrollment.findUnique({
    where: { projectId_studentUserId: { projectId: id, studentUserId: user.id } },
  });
  if (!enrollment) {
    return NextResponse.json({ error: "Please enroll first." }, { status: 400 });
  }

  const next = await prisma.projectEnrollment.update({
    where: { id: enrollment.id },
    data: {
      status: ProjectEnrollmentStatus.SUBMITTED,
      submittedAt: new Date(),
      startedAt: enrollment.startedAt || new Date(),
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_SUBMITTED,
    actorUserId: user.id,
    meta: { projectId: id, mode: "enrolled_project" },
  });

  return NextResponse.json({ enrollment: next });
}

