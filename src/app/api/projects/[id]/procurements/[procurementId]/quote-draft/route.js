import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import { draftQuoteForProvider, loadQuotePool } from "@/lib/projects/provider-auto-responses";

export const runtime = "nodejs";

/** Pre-filled quotation / bid in a provider's character for the officer's record form. */
export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const procurementId = String(params?.procurementId || "").trim();
  const supplierId = String(new URL(request.url).searchParams.get("supplierId") || "").trim();
  if (!projectId || !procurementId || !supplierId) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_PROCUREMENTS,
  });
  if (!auth.ok || auth.type !== "org") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const task = await prisma.projectOrgWorkflowTask.findFirst({
    where: {
      projectId,
      assigneeOrgUserId: auth.orgUser.id,
      status: { in: ["PENDING", "IN_PROGRESS"] },
      instance: { procurementId },
      OR: [{ title: { startsWith: "Receive Quotations" } }, { title: { startsWith: "Receive Bids" } }],
    },
    select: { id: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const pool = await loadQuotePool(prisma, { projectId, procurementId });
  if (!pool?.providers.some((p) => p.id === supplierId)) {
    return NextResponse.json({ error: "This provider is not on the list." }, { status: 400 });
  }

  const draft = await draftQuoteForProvider(prisma, { projectId, procurementId, providerId: supplierId });
  return NextResponse.json({ draft }, { headers: { "Cache-Control": "no-store" } });
}
