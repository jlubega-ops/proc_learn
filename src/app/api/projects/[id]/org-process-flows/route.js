import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cachedRead } from "@/lib/server-cache";
import { cachedJson } from "@/lib/api/cached-json";
import { authorizeProjectOrgRead } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import {
  processFlowSelect,
  serializeProjectOrgProcessFlow,
} from "@/lib/projects/org-process-flows";

export const runtime = "nodejs";

/** Read-only global process catalogue for org workspace viewers. */
export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProjectOrgRead(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_PROCESS_WORKFLOW,
  });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSizeRaw = Number(searchParams.get("pageSize") || 10);
  const pageSize = Math.min(50, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10));
  const skip = (page - 1) * pageSize;

  const payload = await cachedRead(
    `org-process-flows:catalogue:${page}:${pageSize}`,
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
        canManage: false,
      };
    },
  );
  return cachedJson(request, payload, { revalidate: true });
}
