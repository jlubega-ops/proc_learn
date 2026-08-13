import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import {
  autoSubmitIfAttemptExpired,
  computeAttemptTimer,
  startProjectAttempt,
} from "@/lib/academic/project-attempts";
import {
  resolveStudentActiveOrganisation,
  serializeOrgShell,
  switchStudentToAttemptOrg,
  switchStudentToPersonalOrg,
} from "@/lib/projects/student-active-org";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (sessionActiveRole(user) !== Role.STUDENT) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    let resolved = await resolveStudentActiveOrganisation(prisma, user.id);
    if (!resolved?.org) {
      return NextResponse.json({ error: "Organisation not available." }, { status: 404 });
    }

    /** @type {any} */
    let timer = null;
    let autoExpired = false;
    let attemptId = resolved.attempt?.id || null;

    if (attemptId && resolved.academicProject) {
      const expiredResult = await autoSubmitIfAttemptExpired({
        attemptId,
        studentUserId: user.id,
        actorUserId: user.id,
      });
      if (expiredResult) {
        autoExpired = true;
        resolved = await resolveStudentActiveOrganisation(prisma, user.id);
        timer = expiredResult.timer || null;
        attemptId = expiredResult.attempt?.id || attemptId;
      } else {
        timer = computeAttemptTimer({
          attempt: resolved.attempt,
          project: resolved.academicProject,
        });
      }
    } else if (resolved.academicProject) {
      timer = computeAttemptTimer({
        attempt: null,
        project: resolved.academicProject,
      });
    }

    return NextResponse.json({
      org: serializeOrgShell(resolved.org),
      kind: resolved.kind,
      locked: Boolean(resolved.locked),
      academicProject: resolved.academicProject
        ? {
            id: resolved.academicProject.id,
            name: resolved.academicProject.name,
            purpose: resolved.academicProject.purpose,
            organizationName: resolved.academicProject.organizationName,
            description: resolved.academicProject.description,
            instructions: resolved.academicProject.instructions,
            questionText: resolved.academicProject.questionText,
            questionFileUrl: resolved.academicProject.questionFileUrl,
            openAt: resolved.academicProject.openAt,
            closeAt: resolved.academicProject.closeAt,
            durationSeconds: resolved.academicProject.durationSeconds,
          }
        : null,
      attemptId,
      timer,
      autoExpired,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not load organisation context." }, { status: 500 });
  }
}

/**
 * Body:
 *   { action: 'personal' }
 *   | { action: 'join', academicProjectId: string }
 *   | { action: 'enter', academicProjectId: string } — resume existing attempt org
 */
export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (sessionActiveRole(user) !== Role.STUDENT) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = String(body?.action || "").trim();

  try {
    if (action === "personal") {
      const result = await switchStudentToPersonalOrg(prisma, user.id);
      await writeAuditLog({
        eventType: AuditEvent.PROJECT_UPDATED,
        actorUserId: user.id,
        meta: { kind: "STUDENT_ORG_CONTEXT_SWITCH", target: "personal" },
      });
      return NextResponse.json({
        ok: true,
        org: serializeOrgShell(result.org),
        kind: result.kind,
        locked: false,
        redirectTo: "/",
      });
    }

    if (action === "enter") {
      const academicProjectId = String(body?.academicProjectId || "").trim();
      if (!academicProjectId) {
        return NextResponse.json({ error: "Project is required." }, { status: 400 });
      }
      const result = await switchStudentToAttemptOrg(prisma, {
        userId: user.id,
        academicProjectId,
      });
      await writeAuditLog({
        eventType: AuditEvent.PROJECT_UPDATED,
        actorUserId: user.id,
        meta: {
          kind: "STUDENT_ORG_CONTEXT_SWITCH",
          target: "attempt",
          academicProjectId,
        },
      });
      return NextResponse.json({
        ok: true,
        org: serializeOrgShell(result.org),
        kind: result.kind,
        locked: Boolean(result.locked),
        redirectTo: "/organisation",
      });
    }

    if (action === "join") {
      const academicProjectId = String(body?.academicProjectId || "").trim();
      if (!academicProjectId) {
        return NextResponse.json({ error: "Project is required." }, { status: 400 });
      }
      const started = await startProjectAttempt({
        projectId: academicProjectId,
        studentUserId: user.id,
        actorUserId: user.id,
      });
      return NextResponse.json({
        ok: true,
        attempt: started.attempt,
        timer: started.timer || null,
        workspaceProjectId: started.workspaceProjectId || null,
        kind: started.project?.purpose === "ASSESSMENT" ? "ASSESSMENT" : "PRACTICE",
        locked: started.project?.purpose === "ASSESSMENT",
        redirectTo: "/organisation",
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? e.code : "";
    const message = e instanceof Error ? e.message : "Could not switch organisation.";
    const status =
      code === "ASSESSMENT_LOCKED" || code === "PROJECT_IN_PROGRESS"
        ? 403
        : code === "NOT_FOUND" || code === "NO_WORKSPACE"
          ? 404
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
