import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProviderPortalSession } from "@/lib/projects/provider-portal";
import { loadProviderAssignment } from "@/lib/projects/provider-assignments";

export const runtime = "nodejs";

export async function GET(_request, context) {
  const auth = await requireProviderPortalSession(prisma);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const params = await context.params;
  const procurementId = String(params?.procurementId || "").trim();
  const data = procurementId
    ? await loadProviderAssignment(prisma, {
        projectId: auth.project.id,
        providerId: auth.provider.id,
        procurementId,
      })
    : null;
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({
    ...data,
    printedBy: { name: auth.provider.contactPerson || auth.provider.name, role: auth.provider.name },
  });
}
