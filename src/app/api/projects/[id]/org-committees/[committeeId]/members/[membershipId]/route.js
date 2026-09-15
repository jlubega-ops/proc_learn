import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";

export const runtime = "nodejs";

/**
 * Unassign a seat from a committee. Does not delete or edit the organisation user
 * or their organisation role.
 */
export async function DELETE(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const committeeId = String(params?.committeeId || "").trim();
  const membershipId = String(params?.membershipId || "").trim();
  if (!projectId || !committeeId || !membershipId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const auth = await authorizeProjectOrgAdmin(prisma, {
    projectId,
    userId: user.id,
    activeRole,
  });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }

  const membership = await prisma.projectOrgCommitteeMember.findFirst({
    where: {
      id: membershipId,
      committeeId,
      committee: { projectId },
    },
    select: {
      id: true,
      orgUserId: true,
      committeeRole: true,
      committee: { select: { id: true, name: true } },
    },
  });
  if (!membership) {
    return NextResponse.json({ error: "Committee seat not found." }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectOrgUser.updateMany({
      where: {
        id: membership.orgUserId,
        projectId,
        activeCommitteeId: committeeId,
      },
      data: { activeCommitteeId: null },
    });
    await tx.projectOrgCommitteeMember.delete({ where: { id: membershipId } });
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_COMMITTEE_MEMBER_REMOVED,
    actorUserId: user.id,
    meta: {
      projectId,
      committeeId,
      membershipId,
      orgUserId: membership.orgUserId,
      committeeRole: membership.committeeRole,
      kind: "committee_member",
    },
  });

  return NextResponse.json({
    ok: true,
    message:
      "Seat unassigned. The organisation user and their org role were not changed.",
  });
}
