import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProviderPortalSession } from "@/lib/projects/provider-portal";
import { respondToPurchaseInstruction } from "@/lib/projects/purchase-instructions";

export const runtime = "nodejs";

export async function POST(request, context) {
  const auth = await requireProviderPortalSession(prisma);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const params = await context.params;
  const procurementId = String(params?.procurementId || "").trim();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const result = await respondToPurchaseInstruction(prisma, {
    projectId: auth.project.id,
    providerId: auth.provider.id,
    procurementId,
    body,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, fieldErrors: result.fieldErrors }, { status: result.status || 400 });
  }
  return NextResponse.json(result);
}
