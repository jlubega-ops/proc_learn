import { NextResponse } from "next/server";
import { OrgCommitteeType, Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import { committeeTypeLabel } from "@/lib/projects/committee-eligibility";

export const runtime = "nodejs";

const TYPE_SET = new Set(Object.values(OrgCommitteeType));

/**
 * @param {any} row
 */
function serializeCommittee(row) {
  return {
    id: row.id,
    name: row.name,
    committeeType: row.committeeType,
    description: row.description || null,
    isActive: row.isActive,
    members: Array.isArray(row.members)
      ? row.members.map((m) => ({
          id: m.id,
          committeeRole: m.committeeRole,
          startDate: m.startDate,
          endDate: m.endDate,
          status: m.status,
          orgUser: m.orgUser
            ? {
                id: m.orgUser.id,
                firstName: m.orgUser.firstName,
                lastName: m.orgUser.lastName,
                email: m.orgUser.email,
              }
            : null,
        }))
      : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} projectId
 * @param {string} committeeId
 */
async function findCommittee(db, projectId, committeeId) {
  return db.projectOrgCommittee.findFirst({
    where: { id: committeeId, projectId },
    include: {
      members: {
        where: { status: "ACTIVE" },
        include: {
          orgUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      },
      _count: { select: { members: true } },
    },
  });
}

export async function PATCH(request, context) {
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

  const existing = await findCommittee(prisma, projectId, committeeId);
  if (!existing) return NextResponse.json({ error: "Committee not found." }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  /** @type {Record<string, string>} */
  const fieldErrors = {};
  /** @type {import("@prisma/client").Prisma.ProjectOrgCommitteeUpdateInput} */
  const data = {};

  if (body?.committeeType !== undefined) {
    const committeeType = String(body.committeeType || "").trim();
    if (!TYPE_SET.has(committeeType)) fieldErrors.committeeType = "Choose a committee type.";
    else {
      data.committeeType = /** @type {import("@prisma/client").OrgCommitteeType} */ (
        committeeType
      );
      data.name = committeeTypeLabel(committeeType);
    }
  }
  if (body?.description !== undefined) {
    data.description =
      typeof body.description === "string" ? body.description.trim() || null : null;
  }
  if (body?.isActive !== undefined) {
    data.isActive = Boolean(body.isActive);
  }

  if (Object.keys(fieldErrors).length) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors },
      { status: 400 },
    );
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes to save." }, { status: 400 });
  }

  try {
    const row = await prisma.projectOrgCommittee.update({
      where: { id: committeeId },
      data,
      include: {
        members: {
          where: { status: "ACTIVE" },
          include: {
            orgUser: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ORG_COMMITTEE_UPDATED,
      actorUserId: user.id,
      meta: { projectId, committeeId, kind: "committee", changes: Object.keys(data) },
    });

    return NextResponse.json({ committee: serializeCommittee(row) });
  } catch (e) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        {
          error: "A committee of this type already exists for this organisation.",
          fieldErrors: { committeeType: "This committee type is already created." },
        },
        { status: 400 },
      );
    }
    throw e;
  }
}

export async function DELETE(_request, context) {
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

  const existing = await findCommittee(prisma, projectId, committeeId);
  if (!existing) return NextResponse.json({ error: "Committee not found." }, { status: 404 });

  const seatCount = existing._count?.members ?? (existing.members || []).length;

  // Clear active committee context for users using this committee, then delete.
  // Membership rows cascade; organisation users and their org roles are untouched.
  await prisma.$transaction(async (tx) => {
    await tx.projectOrgUser.updateMany({
      where: { projectId, activeCommitteeId: committeeId },
      data: { activeCommitteeId: null },
    });
    await tx.projectOrgCommittee.delete({ where: { id: committeeId } });
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_COMMITTEE_DELETED,
    actorUserId: user.id,
    meta: {
      projectId,
      committeeId,
      name: existing.name,
      seatsRemoved: seatCount,
      kind: "committee",
    },
  });

  return NextResponse.json({
    ok: true,
    seatsRemoved: seatCount,
    message:
      "Committee deleted. Seats were unassigned; organisation users and their org roles were not removed.",
  });
}
