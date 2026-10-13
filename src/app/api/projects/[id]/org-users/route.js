import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { cachedRead } from "@/lib/server-cache";
import { cachedJson } from "@/lib/api/cached-json";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import { listAssignableProjectOrgDepartments } from "@/lib/projects/org-departments";
import {
  ensureProjectOwnerOrgUser,
  getAssignableProjectOrgRole,
  listAssignableProjectOrgRoles,
  orgUserInclude,
  serializeProjectOrgUser,
} from "@/lib/projects/org-users";
import {
  allocateOrgUserLoginEmail,
  ORG_USER_EXISTS_ERROR,
  ORG_USER_EXISTS_FIELD_ERRORS,
  PROJECT_ORG_LEARN_PASSWORD,
} from "@/lib/projects/org-user-identity";
import { hashOrgUserPassword } from "@/lib/projects/org-user-password";
import { ensureProjectCode } from "@/lib/projects/project-identity";
import { resolveOrgUserDepartmentAssignment } from "@/lib/projects/org-departments";
import { validateProjectOrgUserInput } from "@/lib/validation/project-org-user";

export const runtime = "nodejs";


export async function GET(request, context) {
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

  const projectCode = await ensureProjectCode(prisma, projectId);
  if (!projectCode) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const ownerSeed = await ensureProjectOwnerOrgUser(prisma, projectId, user.id);

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSizeRaw = Number(searchParams.get("pageSize") || 10);
  const pageSize = Math.min(50, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10));
  const skip = (page - 1) * pageSize;

  const where = { projectId };

  const cached = await cachedRead(
    `org-users:${projectId}:list:${page}:${pageSize}`,
    ORG_USER_MODELS,
    async () => {
      const [total, rows, assignableRoles, assignableDepartments] = await Promise.all([
        prisma.projectOrgUser.count({ where }),
        prisma.projectOrgUser.findMany({
          where,
          orderBy: [{ isProjectAdmin: "desc" }, { createdAt: "asc" }],
          skip,
          take: pageSize,
          include: orgUserInclude,
        }),
        listAssignableProjectOrgRoles(prisma),
        listAssignableProjectOrgDepartments(prisma, projectId),
      ]);
      return {
        users: rows.map((row) => serializeProjectOrgUser(row)),
        assignableRoles,
        assignableDepartments,
        total,
      };
    },
  );

  const users = cached.users.map((row) =>
    row.isProjectAdmin && row.linkedUserId === user.id
      ? { ...row, studentNumber: ownerSeed?.studentNumber || null }
      : row,
  );

  return cachedJson(request, {
    users,
    projectCode,
    assignableRoles: cached.assignableRoles,
    assignableDepartments: cached.assignableDepartments,
    page,
    pageSize,
    total: cached.total,
    pageCount: Math.max(1, Math.ceil(cached.total / pageSize)),
  });
}

const ORG_USER_MODELS = ["ProjectOrgUser", "ProjectOrgRole", "ProjectOrgDepartment", "Project:delete"];

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

  await ensureProjectOwnerOrgUser(prisma, projectId, user.id);
  const projectCode = await ensureProjectCode(prisma, projectId);
  if (!projectCode) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validated = validateProjectOrgUserInput(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validated.errors },
      { status: 400 },
    );
  }

  const role = await getAssignableProjectOrgRole(prisma, validated.data.projectOrgRoleId);
  if (!role) {
    return NextResponse.json(
      {
        error: "Selected role is not available.",
        fieldErrors: { projectOrgRoleId: "Choose an active role other than Admin." },
      },
      { status: 400 },
    );
  }

  const dept = await resolveOrgUserDepartmentAssignment(
    prisma,
    projectId,
    validated.data.departmentId,
    validated.data.subunitId,
  );
  if (!dept.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: dept.errors },
      { status: 400 },
    );
  }

  const email = await allocateOrgUserLoginEmail(prisma, {
    projectId,
    projectCode,
    firstName: validated.data.firstName,
    lastName: validated.data.lastName,
  });
  if (!email) {
    return NextResponse.json(
      { error: ORG_USER_EXISTS_ERROR, fieldErrors: ORG_USER_EXISTS_FIELD_ERRORS },
      { status: 409 },
    );
  }
  const passwordHash = await hashOrgUserPassword(PROJECT_ORG_LEARN_PASSWORD);

  const row = await prisma.projectOrgUser.create({
    data: {
      projectId,
      firstName: validated.data.firstName,
      lastName: validated.data.lastName,
      email,
      projectOrgRoleId: role.id,
      departmentId: dept.data.departmentId,
      subunitId: dept.data.subunitId,
      isProjectAdmin: false,
      linkedUserId: null,
      passwordHash,
    },
    include: orgUserInclude,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_USER_CREATED,
    actorUserId: user.id,
    meta: {
      projectId,
      projectOrgUserId: row.id,
      email: row.email,
      roleName: role.name,
    },
  });

  return NextResponse.json(
    { user: serializeProjectOrgUser(row, null), loginEmail: row.email },
    { status: 201 },
  );
}
