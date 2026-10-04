import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import { countPendingTasksForNav } from "@/lib/projects/task-counts";

export const runtime = "nodejs";

export async function GET(_request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_TASKS,
  });
  if (!auth.ok || auth.type !== "org") {
    return NextResponse.json({ total: 0, byHref: {} }, { status: auth.ok ? 200 : auth.status || 403 });
  }

  const counts = await countPendingTasksForNav(prisma, {
    projectId,
    orgUserId: auth.orgUser.id,
  });
  return NextResponse.json(counts, { headers: { "Cache-Control": "private, no-store" } });
}
