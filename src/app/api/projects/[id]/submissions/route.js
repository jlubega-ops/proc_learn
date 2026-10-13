import { NextResponse } from "next/server";
import { ProjectEnrollmentStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canViewTeaching } from "@/lib/projects/access";

export const runtime = "nodejs";

export async function GET(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (!canViewTeaching(activeRole)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.creatorRole !== Role.EXAMINER) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const sp = new URL(request.url).searchParams;
  const page = Math.max(1, Number.parseInt(sp.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(sp.get("pageSize") || "20", 10) || 20));
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
      skip: (page - 1) * pageSize,
      take: pageSize,
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
    page,
    pageSize,
    total: totalEnrolled,
  });
}

