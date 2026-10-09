import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createInvoice } from "@/lib/projects/invoices";
import { parseDateInputValue, toDateInputValue } from "@/lib/financial-year-dates";
import { listProviderAssignmentsToInvoice } from "@/lib/projects/provider-assignments";
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
  const opts = { projectId: auth.project.id, providerId: auth.provider.id };
  const [data, toInvoice] = await Promise.all([
    listPortalInvoices(prisma, { ...opts, ...paging }),
    listProviderAssignmentsToInvoice(prisma, opts),
  ]);
  return NextResponse.json({ ...data, toInvoice });
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
    const d = parseDateInputValue(body.invoiceDate);
    if (!d) {
      return NextResponse.json(
        { error: "Enter a valid invoice date.", fieldErrors: { invoiceDate: "Enter a valid date." } },
        { status: 400 },
      );
    }
    if (toDateInputValue(d) > toDateInputValue(new Date())) {
      return NextResponse.json(
        { error: "Please fix the highlighted fields.", fieldErrors: { invoiceDate: "Date cannot be in the future." } },
        { status: 400 },
      );
    }
    invoiceDate = d;
  }
  const supplierReference = typeof body?.supplierReference === "string" ? body.supplierReference.trim() : "";
  if (supplierReference.length > 64) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: { supplierReference: "Max 64 characters." } },
      { status: 400 },
    );
  }

  const result = await createInvoice(prisma, {
    projectId: auth.project.id,
    procurementId,
    actorOrgUserId: null,
    actorRoleName: "Provider (portal)",
    amount: body?.amount,
    invoiceDate,
    supplierReference: supplierReference || null,
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
