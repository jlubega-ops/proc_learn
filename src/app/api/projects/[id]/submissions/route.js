import { NextResponse } from "next/server";
import { ProjectEnrollmentStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";

export const runtime = "nodejs";

export async function GET(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (activeRole !== Role.EXAMINER) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.ownerUserId !== user.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const [notStarted, inProgress, submitted, totalEnrolled, rows] = await Promise.all([
    prisma.projectEnrollment.count({
      where: { projectId: id, status: ProjectEnrollmentStatus.NOT_STARTED },
    }),
    prisma.projectEnrollment.count({
      where: { projectId: id, status: ProjectEnrollmentStatus.IN_PROGRESS },
    }),
    prisma.projectEnrollment.count({
      where: { projectId: id, status: ProjectEnrollmentStatus.SUBMITTED },
    }),
    prisma.projectEnrollment.count({ where: { projectId: id } }),
    prisma.projectEnrollment.findMany({
      where: { projectId: id },
      orderBy: { enrolledAt: "desc" },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    stats: { totalEnrolled, notStarted, inProgress, submitted },
    submissions: rows,
  });
}

