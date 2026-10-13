import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { canManageExaminerProject, canTeach } from "@/lib/projects/access";
import {
  autoEvaluateProjectAttempt,
  manualGradeProjectAttempt,
} from "@/lib/academic/assessment-evaluate";
import { serializeGrade } from "@/lib/academic/assessment-results";

export const runtime = "nodejs";

export async function POST(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (!canTeach(activeRole)) {
    return NextResponse.json({ error: "Only examiners can grade." }, { status: 403 });
  }

  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const attemptId = String(params?.attemptId || "").trim();
  if (!projectId || !attemptId) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.isPersonalOrg || project.isAttemptOrg) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!canManageExaminerProject({ activeRole, project, userId: user.id })) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const attempt = await prisma.projectAttempt.findFirst({
    where: { id: attemptId, enrollment: { projectId } },
  });
  if (!attempt) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "manual").toLowerCase();

  try {
    if (action === "auto" || action === "recalculate") {
      const result = await autoEvaluateProjectAttempt({
        attemptId,
        actorUserId: user.id,
      });
      return NextResponse.json({
        grade: serializeGrade(result.grade, { includeFeedback: true }),
        checkpointResults: result.checkpointResults || [],
        computed: result.computed || null,
        skipped: Boolean(result.skipped),
      });
    }

    const manualScore = Number(body?.manualScore);
    if (!Number.isFinite(manualScore) || manualScore < 0) {
      return NextResponse.json(
        { error: "Please fix the highlighted fields.", errors: { manualScore: "Enter a valid mark." } },
        { status: 400 },
      );
    }

    const result = await manualGradeProjectAttempt({
      attemptId,
      actorUserId: user.id,
      manualScore,
      feedback: body?.feedback,
    });
    return NextResponse.json({
      grade: serializeGrade(result.grade, { includeFeedback: true }),
      computed: result.computed,
    });
  } catch (e) {
    // @ts-ignore
    const code = e?.code;
    if (code === "NO_ASSESSMENT" || code === "MODE") {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    throw e;
  }
}
