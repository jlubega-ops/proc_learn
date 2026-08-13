import { NextResponse } from "next/server";
import { ProjectAttemptStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import {
  computeAttemptTimer,
  serializeAttempt,
  submitProjectAttempt,
} from "@/lib/academic/project-attempts";
import { findStudentPersonalOrg } from "@/lib/projects/student-personal-org";
import { deriveOrganisationProcurementProgress } from "@/lib/projects/derive-org-progress";

export const runtime = "nodejs";

/**
 * Server timer + optional progress refresh. Never trusts client clocks.
 */
export async function GET(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const active = sessionActiveRole(user);

  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const attemptId = String(params?.attemptId || "").trim();
  if (!projectId || !attemptId) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const attempt = await prisma.projectAttempt.findUnique({
    where: { id: attemptId },
    include: { enrollment: { include: { project: true } } },
  });
  if (!attempt || attempt.enrollment.projectId !== projectId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const isOwnerStudent =
    active === Role.STUDENT && attempt.enrollment.studentUserId === user.id;
  const isExaminer =
    active === Role.EXAMINER || active === Role.SYSTEM_ADMIN;
  if (!isOwnerStudent && !isExaminer) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const project = attempt.enrollment.project;
  let current = attempt;
  let autoSubmitted = null;

  if (
    isOwnerStudent &&
    (attempt.status === ProjectAttemptStatus.IN_PROGRESS ||
      attempt.status === ProjectAttemptStatus.RETURNED)
  ) {
    const timerCheck = computeAttemptTimer({ attempt, project });
    if (timerCheck.expired) {
      autoSubmitted = await submitProjectAttempt({
        attemptId: attempt.id,
        studentUserId: user.id,
        actorUserId: user.id,
        autoExpired: true,
      });
      current = autoSubmitted.attempt
        ? { ...attempt, ...autoSubmitted.attempt }
        : attempt;
    }
  }

  const timer = computeAttemptTimer({
    attempt: current,
    project,
  });

  /** @type {any} */
  let progress = null;
  if (isOwnerStudent || isExaminer) {
    const orgUserId = attempt.enrollment.studentUserId;
    const orgId =
      attempt.workspaceProjectId ||
      (
        await prisma.project.findFirst({
          where: {
            ownerUserId: orgUserId,
            isAttemptOrg: true,
            sourceAcademicProjectId: projectId,
          },
          select: { id: true },
        })
      )?.id ||
      (await findStudentPersonalOrg(prisma, orgUserId))?.id ||
      null;
    if (orgId) {
      progress = await deriveOrganisationProcurementProgress(orgId);
    }
  }

  return NextResponse.json({
    attempt: serializeAttempt(
      typeof current === "object" && current.id ? current : attempt,
    ),
    timer: autoSubmitted?.timer || timer,
    progress: progress
      ? { summary: progress.summary, stages: progress.stages }
      : null,
    autoExpired: Boolean(autoSubmitted?.autoExpired),
    readOnly: !isOwnerStudent,
  });
}
