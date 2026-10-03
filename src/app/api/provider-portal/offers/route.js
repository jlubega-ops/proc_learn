import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  loadPortalSolicitation,
  notifyOfficerOfPortalAction,
  requireProviderPortalSession,
} from "@/lib/projects/provider-portal";
import { receiveOffer } from "@/lib/projects/solicitations";

export const runtime = "nodejs";

export async function POST(request) {
  const auth = await requireProviderPortalSession(prisma);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const solicitationId = typeof body?.solicitationId === "string" ? body.solicitationId.trim() : "";
  const solicitation = solicitationId
    ? await loadPortalSolicitation(prisma, {
        projectId: auth.project.id,
        solicitationId,
        providerId: auth.provider.id,
      })
    : null;
  if (!solicitation) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });

  const result = await receiveOffer(prisma, {
    projectId: auth.project.id,
    procurementId: solicitation.procurementId,
    solicitationType: solicitation.solicitationType,
    supplierId: auth.provider.id,
    amount: body?.amount,
    deliveryDays: body?.deliveryDays,
    remarks: body?.remarks,
    source: "PORTAL",
    actorOrgUserId: null,
    actorRoleName: "Provider (portal)",
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, fieldErrors: result.fieldErrors, code: result.code },
      { status: result.status || 400 },
    );
  }

  const word = solicitation.solicitationType === "RFQ" ? "quotation" : "bid";
  await notifyOfficerOfPortalAction(prisma, {
    projectId: auth.project.id,
    procurementId: solicitation.procurementId,
    title: `New ${word} from ${auth.provider.name}`,
    body: `${auth.provider.name} submitted a ${word} for "${solicitation.title}" through the provider portal.`,
    relatedEntityType: "offer",
    relatedEntityId: result.offer.id,
  });

  return NextResponse.json({ ok: true, offer: result.offer });
}
