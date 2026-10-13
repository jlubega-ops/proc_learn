import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { listAcademicProjectParticipants } from "@/lib/academic/project-attempts";
import { prisma } from "@/lib/prisma";
import { canViewExaminerProject } from "@/lib/projects/access";

export const runtime = "nodejs";

/**
 * Examiner view: enrollments, attempts, timing, progress (no grading).
 */
export async function GET(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;

  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.isPersonalOrg || project.isAttemptOrg) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!canViewExaminerProject({ activeRole, project })) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const data = await listAcademicProjectParticipants({ projectId: id });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({
    project: {
      id: data.project.id,
      name: data.project.name,
      purpose: data.project.purpose,
      openAt: data.project.openAt,
      closeAt: data.project.closeAt,
      durationSeconds: data.project.durationSeconds,
      maxAttempts: data.project.maxAttempts,
      allowEditAfterSubmit: data.project.allowEditAfterSubmit,
      isPublished: data.project.isPublished,
    },
    counts: data.counts,
    scoring: data.scoring || null,
    participants: data.participants,
  });
}
