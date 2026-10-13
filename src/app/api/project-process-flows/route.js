import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { cachedRead } from "@/lib/server-cache";
import { cachedJson } from "@/lib/api/cached-json";
import {
  canManageProjectProcessFlows,
  canViewProjectProcessFlows,
} from "@/lib/project-process-flow-access";
import {
  processFlowSelect,
  serializeProjectOrgProcessFlow,
} from "@/lib/projects/org-process-flows";
import { ENGINE_PROCESS_BINDINGS } from "@/lib/projects/process-catalogue";

export const runtime = "nodejs";

export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (!canViewProjectProcessFlows(activeRole)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSizeRaw = Number(searchParams.get("pageSize") || 10);
  const pageSize = Math.min(50, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10));
  const skip = (page - 1) * pageSize;

  const payload = await cachedRead(
    `project-process-flows:list:${page}:${pageSize}`,
    ["ProjectOrgProcessFlow", "ProjectOrgProcessFlowItem"],
    async () => {
      const [total, rows] = await Promise.all([
        prisma.projectOrgProcessFlow.count(),
        prisma.projectOrgProcessFlow.findMany({
          orderBy: [{ name: "asc" }, { createdAt: "asc" }],
          skip,
          take: pageSize,
          select: processFlowSelect,
        }),
      ]);
      return {
        processFlows: rows.map((row) => serializeProjectOrgProcessFlow(row)),
        page,
        pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  );

  return cachedJson(request, {
    ...payload,
    canManage: canManageProjectProcessFlows(activeRole),
    engineBindings: ENGINE_PROCESS_BINDINGS,
  }, { revalidate: true });
}

/** Processes are predefined (see BASELINE_PROCESS_TEMPLATES); only renaming is allowed. */
export async function POST() {
  const user = await getSessionUser();
  if (!user || !canManageProjectProcessFlows(sessionActiveRole(user))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  return NextResponse.json(
    { error: "Processes are predefined. You can only rename them." },
    { status: 400 },
  );
}
