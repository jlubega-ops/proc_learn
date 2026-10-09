import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyOfficerOfPortalAction, requireProviderPortalSession } from "@/lib/projects/provider-portal";
import { updateProviderOffer, withdrawProviderOffer } from "@/lib/projects/solicitations";

export const runtime = "nodejs";

/** @param {any} result */
function errorResponse(result) {
  return NextResponse.json(
    { error: result.error, fieldErrors: result.fieldErrors, code: result.code },
    { status: result.status || 400 },
  );
}

export async function PATCH(request, { params }) {
  const auth = await requireProviderPortalSession(prisma);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { offerId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = await updateProviderOffer(prisma, {
    projectId: auth.project.id,
    offerId: String(offerId),
    providerId: auth.provider.id,
    amount: body?.amount,
    lineItems: body?.lineItems,
    deliveryDays: body?.deliveryDays,
    remarks: body?.remarks,
  });
  if (!result.ok) return errorResponse(result);

  await notifyOfficerOfPortalAction(prisma, {
    projectId: auth.project.id,
    procurementId: result.offer.procurementId,
    title: `Offer revised by ${auth.provider.name}`,
    body: `${auth.provider.name} revised its offer before the closing date.`,
    relatedEntityType: "offer",
    relatedEntityId: result.offer.id,
  });
  return NextResponse.json({ ok: true, offer: result.offer });
}

export async function DELETE(_request, { params }) {
  const auth = await requireProviderPortalSession(prisma);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { offerId } = await params;

  const result = await withdrawProviderOffer(prisma, {
    projectId: auth.project.id,
    offerId: String(offerId),
    providerId: auth.provider.id,
  });
  if (!result.ok) return errorResponse(result);

  await notifyOfficerOfPortalAction(prisma, {
    projectId: auth.project.id,
    procurementId: result.offer.procurementId,
    title: `Offer withdrawn by ${auth.provider.name}`,
    body: `${auth.provider.name} withdrew its offer before the closing date.`,
    relatedEntityType: "offer",
    relatedEntityId: result.offer.id,
  });
  return NextResponse.json({ ok: true, offer: result.offer });
}
