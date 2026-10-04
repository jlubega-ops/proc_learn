import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProviderPortalSession } from "@/lib/projects/provider-portal";
import { loadProviderAssignment } from "@/lib/projects/provider-assignments";
import { submitDeliveryNote } from "@/lib/projects/delivery-notes";

export const runtime = "nodejs";

export async function POST(request, context) {
  const auth = await requireProviderPortalSession(prisma);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const params = await context.params;
  const procurementId = String(params?.procurementId || "").trim();
  const opts = { projectId: auth.project.id, providerId: auth.provider.id, procurementId };
  const assignment = procurementId ? await loadProviderAssignment(prisma, opts) : null;
  if (!assignment) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (["CANCELLED", "REJECTED", "CLOSED"].includes(assignment.procurement.status)) {
    return NextResponse.json({ error: "This procurement is no longer open." }, { status: 400 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const result = await submitDeliveryNote(prisma, { ...opts, body });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, fieldErrors: result.fieldErrors }, { status: result.status || 400 });
  }
  return NextResponse.json(result);
}
