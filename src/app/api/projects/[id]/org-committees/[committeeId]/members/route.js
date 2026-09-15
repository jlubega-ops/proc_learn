import { NextResponse } from "next/server";
import { OrgCommitteeMemberRole, OrgCommitteeMembershipStatus, Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import { toDateInputValue } from "@/lib/financial-year-dates";
import { validateCommitteeSeatEligibility } from "@/lib/projects/committee-eligibility";

export const runtime = "nodejs";

const ROLE_SET = new Set(Object.values(OrgCommitteeMemberRole));

export async function POST(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const committeeId = String(params?.committeeId || "").trim();
  if (!projectId || !committeeId) {
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

  const committee = await prisma.projectOrgCommittee.findFirst({
    where: { id: committeeId, projectId },
    select: { id: true, name: true, committeeType: true },
  });
  if (!committee) return NextResponse.json({ error: "Committee not found." }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const orgUserId = typeof body?.orgUserId === "string" ? body.orgUserId.trim() : "";
  const committeeRole = String(body?.committeeRole || "").trim();
  const startDateRaw =
    typeof body?.startDate === "string" && body.startDate.trim()
      ? body.startDate.trim()
      : toDateInputValue(new Date());

  /** @type {Record<string, string>} */
  const fieldErrors = {};
  if (!orgUserId) fieldErrors.orgUserId = "Choose an organisation user.";
  if (!ROLE_SET.has(committeeRole)) fieldErrors.committeeRole = "Choose a committee role.";
  if (Object.keys(fieldErrors).length) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors },
      { status: 400 },
    );
  }

  const orgUser = await prisma.projectOrgUser.findFirst({
    where: { id: orgUserId, projectId, isProjectAdmin: false },
    select: {
      id: true,
      projectOrgRole: { select: { name: true } },
    },
  });
  if (!orgUser) {
    return NextResponse.json(
      {
        error: "Choose a valid organisation user.",
        fieldErrors: { orgUserId: "Choose a valid organisation user." },
      },
      { status: 400 },
    );
  }

  const otherSeats = await prisma.projectOrgCommitteeMember.findMany({
    where: {
      orgUserId,
      status: OrgCommitteeMembershipStatus.ACTIVE,
      committee: { projectId, isActive: true, id: { not: committeeId } },
    },
    select: { committee: { select: { committeeType: true } } },
  });
  const activeContractsSeat = otherSeats.some((s) => s.committee?.committeeType === "CONTRACTS");
  const activeEvaluationSeat = otherSeats.some(
    (s) =>
      s.committee?.committeeType === "EVALUATION" ||
      s.committee?.committeeType === "NEGOTIATION",
  );

  const eligibility = validateCommitteeSeatEligibility({
    committeeType: committee.committeeType,
    committeeRole,
    orgRoleName: orgUser.projectOrgRole?.name || "",
    activeContractsSeat,
    activeEvaluationSeat,
  });
  if (!eligibility.ok) {
    /** @type {Record<string, string>} */
    const fe = {};
    if (eligibility.field) fe[eligibility.field] = eligibility.error;
    return NextResponse.json(
      { error: eligibility.error, fieldErrors: fe },
      { status: 400 },
    );
  }

  try {
    const row = await prisma.projectOrgCommitteeMember.create({
      data: {
        committeeId,
        orgUserId,
        committeeRole: /** @type {import("@prisma/client").OrgCommitteeMemberRole} */ (
          committeeRole
        ),
        startDate: new Date(startDateRaw),
        status: OrgCommitteeMembershipStatus.ACTIVE,
      },
    });

    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ORG_COMMITTEE_MEMBER_ADDED,
      actorUserId: user.id,
      meta: {
        projectId,
        committeeId,
        membershipId: row.id,
        orgUserId,
        committeeRole,
        kind: "committee_member",
      },
    });

    return NextResponse.json({ member: row }, { status: 201 });
  } catch (e) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        {
          error: "This user is already a member of this committee.",
          fieldErrors: { orgUserId: "User already belongs to this committee." },
        },
        { status: 400 },
      );
    }
    throw e;
  }
}
