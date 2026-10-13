import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { cachedRead } from "@/lib/server-cache";
import { cachedJson } from "@/lib/api/cached-json";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import { authorizeProjectOrgRead } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import {
  buildDepartmentTree,
  deptSelect,
  listProjectOrgDepartmentUnits,
  serializeProjectOrgDepartment,
} from "@/lib/projects/org-departments";
import { validateProjectOrgDepartmentInput } from "@/lib/validation/project-org-department";

export const runtime = "nodejs";

/**
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} projectId
 * @param {string | null} parentId
 */
async function nextSiblingSortOrder(db, projectId, parentId) {
  const agg = await db.projectOrgDepartment.aggregate({
    where: { projectId, parentId: parentId || null },
    _max: { sortOrder: true },
  });
  return (agg._max.sortOrder ?? -1) + 1;
}

export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const view = (searchParams.get("view") || "").trim().toLowerCase();
  const isStructureView = view === "structure" || view === "flat";

  const auth = await authorizeProjectOrgRead(prisma, {
    projectId,
    orgPermission: isStructureView
      ? ORG_PERMISSION.VIEW_ORG_STRUCTURE
      : ORG_PERMISSION.VIEW_DEPARTMENTS,
  });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }

  if (isStructureView) {
    const payload = await cachedRead(`org-departments:${projectId}:structure`, DEPT_MODELS, async () => {
      const units = await listProjectOrgDepartmentUnits(prisma, projectId);
      return { units, tree: buildDepartmentTree(units) };
    });
    return cachedJson(request, payload, { revalidate: true });
  }

  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSizeRaw = Number(searchParams.get("pageSize") || 10);
  const pageSize = Math.min(50, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10));
  const skip = (page - 1) * pageSize;

  const where = { projectId, parentId: null };

  const payload = await cachedRead(
    `org-departments:${projectId}:list:${page}:${pageSize}`,
    DEPT_MODELS,
    async () => {
      const [total, rows] = await Promise.all([
        prisma.projectOrgDepartment.count({ where }),
        prisma.projectOrgDepartment.findMany({
          where,
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          skip,
          take: pageSize,
          select: {
            ...deptSelect,
            subunits: {
              orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
              select: deptSelect,
            },
          },
        }),
      ]);
      return {
        departments: rows.map((row) => serializeProjectOrgDepartment(row)),
        page,
        pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  );
  return cachedJson(request, payload, { revalidate: true });
}

const DEPT_MODELS = ["ProjectOrgDepartment", "Project:delete"];

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

  const validated = validateProjectOrgDepartmentInput(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validated.errors },
      { status: 400 },
    );
  }

  if (validated.data.parentId) {
    const parent = await prisma.projectOrgDepartment.findFirst({
      where: { id: validated.data.parentId, projectId, parentId: null },
    });
    if (!parent) {
      return NextResponse.json(
        {
          error: "Parent department not found.",
          fieldErrors: { parentId: "Choose a valid department for this subunit." },
        },
        { status: 400 },
      );
    }
  }

  const row = await prisma.projectOrgDepartment.create({
    data: {
      projectId,
      parentId: validated.data.parentId,
      name: validated.data.name,
      description: validated.data.description,
      isActive: validated.data.isActive,
      sortOrder: await nextSiblingSortOrder(prisma, projectId, validated.data.parentId),
    },
    select: {
      ...deptSelect,
      subunits: { select: deptSelect },
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_DEPARTMENT_CREATED,
    actorUserId: user.id,
    meta: {
      projectId,
      departmentId: row.id,
      name: row.name,
      parentId: row.parentId,
    },
  });

  return NextResponse.json({ department: serializeProjectOrgDepartment(row) }, { status: 201 });
}
