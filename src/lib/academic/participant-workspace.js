/**
 * The attempt organisation an examiner reviews for one participant on an academic project.
 */
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canViewExaminerProject } from "@/lib/projects/access";
import { findStudentAttemptOrg } from "@/lib/projects/student-attempt-org";

/**
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} academicProjectId
 * @param {string} studentUserId
 * @returns {Promise<{ id: string; ownerUserId: string } | null>}
 */
export async function resolveParticipantWorkspace(db, academicProjectId, studentUserId) {
  const latest = await db.projectAttempt.findFirst({
    where: { enrollment: { projectId: academicProjectId, studentUserId } },
    orderBy: { attemptNumber: "desc" },
    select: { workspaceProjectId: true },
  });
  if (latest?.workspaceProjectId) {
    const ws = await db.project.findFirst({
      where: { id: latest.workspaceProjectId, ownerUserId: studentUserId },
      select: { id: true },
    });
    if (ws) return { id: ws.id, ownerUserId: studentUserId };
  }
  const org = await findStudentAttemptOrg(db, { studentUserId, academicProjectId });
  return org ? { id: org.id, ownerUserId: studentUserId } : null;
}

/**
 * Examiner / system admin gate for participant routes. 404 hides other examiners' projects.
 * @param {any} context route context with `params: Promise<{ id, studentId }>`
 */
export async function authorizeParticipantView(context) {
  const actor = await getSessionUser();
  if (!actor) return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  const activeRole = sessionActiveRole(actor) || Role.STUDENT;
  const params = await context.params;
  const id = String(params?.id || "").trim();
  const studentId = String(params?.studentId || "").trim();
  if (!id || !studentId) return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.isPersonalOrg || project.isAttemptOrg) {
    return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  }
  if (!canViewExaminerProject({ activeRole, project })) {
    return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  }
  const enrolled = await prisma.projectEnrollment.findUnique({
    where: { projectId_studentUserId: { projectId: id, studentUserId: studentId } },
    select: { id: true },
  });
  if (!enrolled) return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  return { actor, activeRole, project, studentId };
}
