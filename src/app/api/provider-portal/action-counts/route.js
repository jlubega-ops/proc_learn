import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  countPortalOpportunitiesNeedingAction,
  requireProviderPortalSession,
} from "@/lib/projects/provider-portal";
import {
  countProviderAssignmentsNeedingAction,
  listProviderAssignmentsToInvoice,
} from "@/lib/projects/provider-assignments";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireProviderPortalSession(prisma);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const opts = { projectId: auth.project.id, providerId: auth.provider.id };
  const [assignments, opportunities, toInvoice] = await Promise.all([
    countProviderAssignmentsNeedingAction(prisma, opts),
    countPortalOpportunitiesNeedingAction(prisma, opts),
    listProviderAssignmentsToInvoice(prisma, opts),
  ]);
  return NextResponse.json(
    {
      "/provider-portal": assignments,
      "/provider-portal/opportunities": opportunities,
      "/provider-portal/invoices": toInvoice.length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
