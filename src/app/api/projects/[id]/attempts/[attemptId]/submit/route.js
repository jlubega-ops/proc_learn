import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { submitProjectAttempt } from "@/lib/academic/project-attempts";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Submit a ProjectAttempt (server-side). Path projectId must match the attempt.
 */
export async function POST(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (sessionActiveRole(user) !== Role.STUDENT) {
    return NextResponse.json({ error: "Only students can submit attempts." }, { status: 403 });
  }

  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const attemptId = String(params?.attemptId || "").trim();
  if (!attemptId || !projectId) {
    return NextResponse.json({ error: "Invalid attempt id." }, { status: 400 });
  }

  const owned = await prisma.projectAttempt.findFirst({
    where: {
      id: attemptId,
      enrollment: { projectId, studentUserId: user.id },
    },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    const result = await submitProjectAttempt({
      attemptId,
      studentUserId: user.id,
      actorUserId: user.id,
    });
    // Soften response: never expose grade scores here (resultsReleased gate elsewhere).
    return NextResponse.json({
      ok: true,
      attempt: result.attempt,
      alreadySubmitted: result.alreadySubmitted,
      timer: result.timer,
      autoExpired: result.autoExpired,
    });
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? e.code : "";
    const message = e instanceof Error ? e.message : "Could not submit attempt.";
    const status =
      code === "NOT_FOUND" ? 404 : code === "INVALID_STATE" ? 400 : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: message }, { status });
  }
}
