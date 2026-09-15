import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { authorizeProjectOrgAdmin } from "@/lib/projects/workspace-access";
import {
  buildDepartmentTree,
  saveProjectOrgDepartmentStructure,
} from "@/lib/projects/org-departments";

export const runtime = "nodejs";

/**
 * Persist organisation structure: parent links + sibling sort order (max depth 2).
 * Body: { nodes: [{ id, parentId: null|string, sortOrder: number }] }
 */
export async function PUT(request, context) {
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

  const saved = await saveProjectOrgDepartmentStructure(prisma, {
    projectId,
    nodes: body?.nodes,
  });
  if (!saved.ok) {
    return NextResponse.json(
      { error: saved.error },
      { status: saved.status || 400 },
    );
  }

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_STRUCTURE_UPDATED,
    actorUserId: user.id,
    meta: {
      projectId,
      nodeCount: saved.units.length,
    },
  });

  return NextResponse.json({
    units: saved.units,
    tree: buildDepartmentTree(saved.units),
  });
}
