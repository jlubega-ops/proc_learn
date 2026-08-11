import { NextResponse } from "next/server";
import { ProjectAttemptStatus, ProjectStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { submitProjectAttempt } from "@/lib/academic/project-attempts";

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

  if (project.ownerUserId === user.id && project.creatorRole === Role.STUDENT) {
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

  if (project.creatorRole === Role.EXAMINER && project.requiresEnrollment) {
    const enrollment = await prisma.projectEnrollment.findUnique({
      where: { projectId_studentUserId: { projectId: id, studentUserId: user.id } },
      include: {
        attempts: {
          where: {
            status: {
              in: [
                ProjectAttemptStatus.IN_PROGRESS,
                ProjectAttemptStatus.RETURNED,
                ProjectAttemptStatus.NOT_STARTED,
              ],
            },
          },
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
      },
    });
    if (!enrollment) {
      return NextResponse.json({ error: "Please enroll first." }, { status: 400 });
    }
    let attempt = enrollment.attempts[0];
    if (!attempt) {
      attempt = await prisma.projectAttempt.findFirst({
        where: { enrollmentId: enrollment.id },
        orderBy: { attemptNumber: "desc" },
      });
    }
    if (!attempt) {
      return NextResponse.json({ error: "Start an attempt before submitting." }, { status: 400 });
    }
    try {
      const result = await submitProjectAttempt({
        attemptId: attempt.id,
        studentUserId: user.id,
        actorUserId: user.id,
      });
      await writeAuditLog({
        eventType: AuditEvent.PROJECT_SUBMITTED,
        actorUserId: user.id,
        meta: {
          projectId: id,
          mode: "academic_attempt",
          attemptId: attempt.id,
        },
      });
      return NextResponse.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not submit attempt.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "Please enroll first." }, { status: 400 });
}
