import { NextResponse } from "next/server";
import { OrgCommitteeType, Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import { authorizeProjectOrgRead } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
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

export async function GET(_request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProjectOrgRead(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_COMMITTEES,
  });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }

  const rows = await prisma.projectOrgCommittee.findMany({
    where: { projectId },
    orderBy: [{ name: "asc" }],
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

  return NextResponse.json({
    committees: rows.map(serializeCommittee),
    total: rows.length,
    canManage: auth.type === "platform" && !auth.readOnly,
  });
}

export async function POST(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const committeeType = String(body?.committeeType || "").trim();
  const description =
    typeof body?.description === "string" ? body.description.trim() || null : null;
  const name = TYPE_SET.has(committeeType) ? committeeTypeLabel(committeeType) : "";

  /** @type {Record<string, string>} */
  const fieldErrors = {};
  if (!TYPE_SET.has(committeeType)) fieldErrors.committeeType = "Choose a committee type.";
  if (Object.keys(fieldErrors).length) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors },
      { status: 400 },
    );
  }

  try {
    const row = await prisma.projectOrgCommittee.create({
      data: {
        projectId,
        name,
        committeeType: /** @type {import("@prisma/client").OrgCommitteeType} */ (committeeType),
        description,
      },
      include: { members: true },
    });

    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ORG_COMMITTEE_CREATED,
      actorUserId: user.id,
      meta: { projectId, committeeId: row.id, name: row.name, kind: "committee" },
    });

    return NextResponse.json({ committee: serializeCommittee(row) }, { status: 201 });
  } catch (e) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        {
          error: `A ${name} already exists for this organisation.`,
          fieldErrors: { committeeType: "This committee type is already created." },
        },
        { status: 400 },
      );
    }
    throw e;
  }
}
