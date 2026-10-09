import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyOfficerOfPortalAction, requireProviderPortalSession } from "@/lib/projects/provider-portal";
import { answerOfferClarification } from "@/lib/projects/offer-clarifications";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const auth = await requireProviderPortalSession(prisma);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { clarificationId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = await answerOfferClarification(prisma, {
    projectId: auth.project.id,
    providerId: auth.provider.id,
    clarificationId: String(clarificationId),
    response: body?.response,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, fieldErrors: result.fieldErrors },
      { status: result.status || 400 },
    );
  }

  await notifyOfficerOfPortalAction(prisma, {
    projectId: auth.project.id,
    procurementId: result.procurementId,
    title: `Clarification answered by ${auth.provider.name}`,
    body: `${auth.provider.name} answered your question on "${result.offer?.solicitation?.title || "its offer"}".`,
    relatedEntityType: "offer",
    relatedEntityId: result.clarification.offerId,
  });
  return NextResponse.json({ ok: true, clarification: result.clarification });
}
