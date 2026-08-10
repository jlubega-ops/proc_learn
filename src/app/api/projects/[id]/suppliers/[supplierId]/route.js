import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import { getSupplier } from "@/lib/projects/suppliers";

export const runtime = "nodejs";

export async function GET(_request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const supplierId = String(params?.supplierId || "").trim();
  if (!projectId || !supplierId) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  let auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_SUPPLIERS,
  });
  if (!auth.ok) {
    const adminAuth = await authorizeProjectApiAccess(prisma, { projectId, requireOrgAdmin: true });
    if (!adminAuth.ok) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  const supplier = await getSupplier(prisma, projectId, supplierId);
  if (!supplier) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ supplier });
}
