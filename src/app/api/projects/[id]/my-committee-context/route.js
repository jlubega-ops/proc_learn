import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import {
  getActiveCommittee,
  listMyCommittees,
  setActiveCommittee,
} from "@/lib/projects/committee-context";

export const runtime = "nodejs";

/**
 * Committee context for the signed-in organisation user (not permanent org roles).
 * GET lists memberships + active committee; PATCH sets or clears activeCommitteeId.
 */
export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_OVERVIEW,
  });
  if (!auth.ok || auth.type !== "org") {
    return NextResponse.json(
      { error: "Only organisation users can manage committee context." },
      { status: 403 },
    );
  }

  const [committees, activeCommittee] = await Promise.all([
    listMyCommittees(prisma, { projectId, orgUserId: auth.orgUser.id }),
    getActiveCommittee(prisma, auth.orgUser.id),
  ]);

  let activeWithRole = null;
  if (activeCommittee) {
    const match = committees.find((c) => c.id === activeCommittee.id);
    activeWithRole = {
      id: activeCommittee.id,
      name: activeCommittee.name,
      committeeType: activeCommittee.committeeType,
      committeeRole: match?.committeeRole || null,
    };
  }

  return NextResponse.json({
    committees,
    activeCommittee: activeWithRole,
    orgRoleName: auth.orgUser.projectOrgRole?.name || null,
  });
}

export async function PATCH(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_OVERVIEW,
  });
  if (!auth.ok || auth.type !== "org") {
    return NextResponse.json(
      { error: "Only organisation users can manage committee context." },
      { status: 403 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawId = body?.committeeId;
  const committeeId =
    rawId === null || rawId === undefined || rawId === ""
      ? null
      : typeof rawId === "string"
        ? rawId.trim()
        : null;

  if (rawId != null && rawId !== "" && committeeId === null) {
    return NextResponse.json(
      { error: "committeeId must be a string id or null to clear context." },
      { status: 400 },
    );
  }

  const result = await setActiveCommittee(prisma, {
    projectId,
    orgUserId: auth.orgUser.id,
    committeeId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Could not update committee context." },
      { status: result.status || 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    activeCommittee: result.activeCommittee,
    orgRoleName: auth.orgUser.projectOrgRole?.name || null,
  });
}
