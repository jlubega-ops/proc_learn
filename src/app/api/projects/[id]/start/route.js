import { NextResponse } from "next/server";
import { ProjectEnrollmentStatus, ProjectStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";

export const runtime = "nodejs";

function isProjectOpenNow(project) {
  const now = Date.now();
  const openAtMs = project?.openAt ? new Date(project.openAt).getTime() : null;
  const closeAtMs = project?.closeAt ? new Date(project.closeAt).getTime() : null;
  if (openAtMs && now < openAtMs) return false;
  if (closeAtMs && now > closeAtMs) return false;
  return true;
}

export async function POST(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (activeRole !== Role.STUDENT) {
    return NextResponse.json({ error: "Only students can start projects." }, { status: 403 });
  }

  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!isProjectOpenNow(project)) {
    return NextResponse.json(
      { error: "This project is not open right now. You can only start when it is open." },
      { status: 400 },
    );
  }

  if (project.ownerUserId === user.id && project.creatorRole === Role.STUDENT) {
    const updated = await prisma.project.update({
      where: { id },
      data: {
        status:
          project.status === ProjectStatus.COMPLETED
            ? ProjectStatus.COMPLETED
            : ProjectStatus.IN_PROGRESS,
      },
    });
    await writeAuditLog({
      eventType: AuditEvent.PROJECT_STARTED,
      actorUserId: user.id,
      meta: { projectId: id, mode: "self_project" },
    });
    return NextResponse.json({ project: updated, mode: "self_project" });
  }

  const enrollment = await prisma.projectEnrollment.findUnique({
    where: { projectId_studentUserId: { projectId: id, studentUserId: user.id } },
  });
  if (
    ![Role.LECTURER, Role.EXAMINER].includes(project.creatorRole) ||
    !project.requiresEnrollment ||
    !project.isPublished
  ) {
    return NextResponse.json(
      { error: "This project cannot be started through enrollment flow." },
      { status: 400 },
    );
  }
  if (!enrollment) {
    return NextResponse.json({ error: "Please enroll first." }, { status: 400 });
  }
  if (enrollment.status === ProjectEnrollmentStatus.SUBMITTED) {
    return NextResponse.json({ error: "Already submitted." }, { status: 400 });
  }

  const next = await prisma.projectEnrollment.update({
    where: { id: enrollment.id },
    data: {
      status: ProjectEnrollmentStatus.IN_PROGRESS,
      startedAt: enrollment.startedAt || new Date(),
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_STARTED,
    actorUserId: user.id,
    meta: { projectId: id },
  });

  return NextResponse.json({ enrollment: next });
}

