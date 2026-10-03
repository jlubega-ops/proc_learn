import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listPortalOrders, parsePortalPaging, requireProviderPortalSession } from "@/lib/projects/provider-portal";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireProviderPortalSession(prisma);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const paging = parsePortalPaging(new URL(request.url).searchParams);
  const data = await listPortalOrders(prisma, {
    projectId: auth.project.id,
    providerId: auth.provider.id,
    ...paging,
  });
  return NextResponse.json(data);
}
