import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getReadableAppSession } from "@/lib/auth/session";
import { getSessionOrgUser } from "@/lib/api/get-session-org-user";
import { requireProviderPortalSession } from "@/lib/projects/provider-portal";
import { formatUserDisplayName } from "@/lib/user-display";
import {
  attemptLockedMessage,
  loadAttemptWorkspaceState,
} from "@/lib/academic/attempt-workspace";
import {
  autoSubmitIfAttemptExpired,
  submitProjectAttempt,
} from "@/lib/academic/project-attempts";

export const runtime = "nodejs";

/**
 * Org users and providers signed in to a student's attempt organisation.
 * @returns {Promise<null | { workspaceId: string; actor: { type: "org_user" | "provider"; id: string; name: string | null } }>}
 */
async function resolveAttemptMember() {
  const session = await getReadableAppSession();
  if (session?.orgUserId) {
    const orgUser = await getSessionOrgUser();
    if (!orgUser) return null;
    return {
      workspaceId: orgUser.projectId,
      actor: { type: "org_user", id: orgUser.id, name: formatUserDisplayName(orgUser) || orgUser.email },
    };
  }
  if (session?.providerId) {
    const auth = await requireProviderPortalSession(prisma);
    if (!auth.ok) return null;
    return {
      workspaceId: auth.provider.projectId,
      actor: { type: "provider", id: auth.provider.id, name: auth.provider.name || null },
    };
  }
  return null;
}

/** @param {NonNullable<Awaited<ReturnType<typeof loadAttemptWorkspaceState>>>} state */
function serializeState(state, extra = {}) {
  return {
    attempt: state.attempt
      ? {
          id: state.attempt.id,
          status: state.attempt.status,
          academicProjectId: state.academicProject.id,
          projectName: state.academicProject.name,
          purpose: state.academicProject.purpose,
          organisationName: state.workspace.organizationName || state.workspace.name,
        }
      : null,
    timer: state.timer,
    locked: state.locked,
    lockReason: state.lockReason,
    ...extra,
  };
}

export async function GET() {
  const member = await resolveAttemptMember();
  if (!member) return NextResponse.json({ attempt: null }, { headers: { "Cache-Control": "no-store" } });

  let state = await loadAttemptWorkspaceState(prisma, member.workspaceId);
  if (!state?.attempt) {
    return NextResponse.json({ attempt: null }, { headers: { "Cache-Control": "no-store" } });
  }

  let autoExpired = false;
  if (state.inFlight && state.timer?.expired && state.studentUserId) {
    const result = await autoSubmitIfAttemptExpired({
      attemptId: state.attempt.id,
      studentUserId: state.studentUserId,
      actorUserId: state.studentUserId,
    }).catch(() => null);
    if (result) {
      autoExpired = true;
      state = (await loadAttemptWorkspaceState(prisma, member.workspaceId)) || state;
    }
  }

  return NextResponse.json(serializeState(state, { autoExpired }), {
    headers: { "Cache-Control": "no-store" },
  });
}

/** Body: { action: "submit" } — submits the student's attempt on their behalf. */
export async function POST(request) {
  const member = await resolveAttemptMember();
  if (!member) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (String(body?.action || "") !== "submit") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const state = await loadAttemptWorkspaceState(prisma, member.workspaceId);
  if (!state?.attempt || !state.studentUserId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!state.inFlight) {
    return NextResponse.json({ error: attemptLockedMessage(state.lockReason) }, { status: 400 });
  }

  try {
    await submitProjectAttempt({
      attemptId: state.attempt.id,
      studentUserId: state.studentUserId,
      actorUserId: state.studentUserId,
      autoExpired: Boolean(state.timer?.expired),
      submittedBy: member.actor,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not submit.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const next = await loadAttemptWorkspaceState(prisma, member.workspaceId);
  return NextResponse.json(serializeState(next || state, { ok: true }));
}
