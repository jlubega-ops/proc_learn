import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import {
  procurementInclude,
  serializeProcurement,
} from "@/lib/projects/procurements";
import {
  orgOpsSlateListWhere,
  resolveCurrentOrgSlateId,
} from "@/lib/academic/org-academic-slate";

export const runtime = "nodejs";

export async function GET(_request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_PROCUREMENTS,
  });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }

  /** @type {Record<string, unknown>} */
  const where = { projectId };
  if (auth.type === "org") {
    const role = auth.orgUser.projectOrgRole?.name || "";
    if (
      (role === "User Department Officer" ||
        role === "User Department" ||
        role === "Head User Department" ||
        role === "Head of User Department") &&
      auth.orgUser.departmentId
    ) {
      where.departmentId = auth.orgUser.departmentId;
    }
  }
  Object.assign(where, orgOpsSlateListWhere(await resolveCurrentOrgSlateId(prisma, projectId)));

  const rows = await prisma.projectOrgProcurement.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    include: procurementInclude,
  });

  const grouped = await prisma.projectOrgProcurement.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });
  /** @type {Record<string, number>} */
  const stats = { total: 0 };
  for (const g of grouped) {
    stats[g.status] = g._count._all;
    stats.total += g._count._all;
  }

  return NextResponse.json({
    procurements: rows.map(serializeProcurement),
    total: rows.length,
    stats,
  });
}
