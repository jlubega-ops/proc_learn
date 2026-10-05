import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createInvoice } from "@/lib/projects/invoices";
import {
  listPortalInvoices,
  parsePortalPaging,
  requireProviderPortalSession,
} from "@/lib/projects/provider-portal";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireProviderPortalSession(prisma);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const paging = parsePortalPaging(new URL(request.url).searchParams);
  const data = await listPortalInvoices(prisma, {
    projectId: auth.project.id,
    providerId: auth.provider.id,
    ...paging,
  });
  return NextResponse.json(data);
}

export async function POST(request) {
  const auth = await requireProviderPortalSession(prisma);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const procurementId = typeof body?.procurementId === "string" ? body.procurementId.trim() : "";
  if (!procurementId) {
    return NextResponse.json(
      { error: "Choose the order you are invoicing.", fieldErrors: { procurementId: "Choose an order." } },
      { status: 400 },
    );
  }
  let invoiceDate = null;
  if (typeof body?.invoiceDate === "string" && body.invoiceDate.trim()) {
    const d = new Date(body.invoiceDate);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: "Enter a valid invoice date.", fieldErrors: { invoiceDate: "Enter a valid date." } },
        { status: 400 },
      );
    }
    invoiceDate = d;
  }

  const result = await createInvoice(prisma, {
    projectId: auth.project.id,
    procurementId,
    actorOrgUserId: null,
    actorRoleName: "Provider (portal)",
    amount: body?.amount,
    invoiceDate,
    source: "PORTAL",
    notes: typeof body?.notes === "string" ? body.notes : null,
    portalProviderId: auth.provider.id,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, fieldErrors: result.fieldErrors, code: result.code },
      { status: result.status || 400 },
    );
  }
  return NextResponse.json({ ok: true, invoice: result.invoice });
}
