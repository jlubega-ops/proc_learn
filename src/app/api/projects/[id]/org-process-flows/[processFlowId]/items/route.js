import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cachedRead } from "@/lib/server-cache";
import { cachedJson } from "@/lib/api/cached-json";
import { authorizeProjectApiAccess, authorizeProjectOrgRead } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import { listAssignableProjectOrgRoles } from "@/lib/projects/org-users";
import {
  processFlowItemSelect,
  serializeProjectOrgProcessFlowItem,
} from "@/lib/projects/org-process-flows";

export const runtime = "nodejs";

/**
 * Organisation Administrator (platform) or org member with workflow view may read steps.
 */
async function authorizeProcessStepsRead(prismaClient, projectId) {
  const orgRead = await authorizeProjectOrgRead(prismaClient, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_PROCESS_WORKFLOW,
  });
  if (orgRead.ok) return orgRead;

  // Fallback: any authorised workspace viewer (catalogue steps are not secret).
  const access = await authorizeProjectApiAccess(prismaClient, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_PROCESS_WORKFLOW,
  });
  if (access.ok) return access;
  return orgRead.ok === false ? orgRead : access;
}

/** Read-only process steps for org workspace viewers. */
export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const processFlowId = String(params?.processFlowId || "").trim();
  if (!projectId || !processFlowId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const auth = await authorizeProcessStepsRead(prisma, projectId);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status || 404 },
    );
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSizeRaw = Number(searchParams.get("pageSize") || 10);
  const pageSize = Math.min(50, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10));
  const skip = (page - 1) * pageSize;

  const where = { processFlowId };

  const payload = await cachedRead(
    `org-process-flows:items:${processFlowId}:${page}:${pageSize}`,
    ["ProjectOrgProcessFlow", "ProjectOrgProcessFlowItem", "ProjectOrgRole"],
    async () => {
      const processFlow = await prisma.projectOrgProcessFlow.findUnique({
        where: { id: processFlowId },
        select: { id: true, name: true },
      });
      if (!processFlow) return null;

      const [total, rows, assignableRoles] = await Promise.all([
        prisma.projectOrgProcessFlowItem.count({ where }),
        prisma.projectOrgProcessFlowItem.findMany({
          where,
          orderBy: [{ stepNumber: "asc" }, { createdAt: "asc" }],
          skip,
          take: pageSize,
          select: processFlowItemSelect,
        }),
        listAssignableProjectOrgRoles(prisma),
      ]);

      return {
        processFlow,
        items: rows.map((row) => serializeProjectOrgProcessFlowItem(row)),
        assignableRoles,
        page,
        pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
        canManage: false,
      };
    },
  );
  if (!payload) {
    return NextResponse.json({ error: "Process not found." }, { status: 404 });
  }
  return cachedJson(request, payload, { revalidate: true });
}
