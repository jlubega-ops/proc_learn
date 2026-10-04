import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProviderPortalSession, serializePortalProfile } from "@/lib/projects/provider-portal";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireProviderPortalSession(prisma);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ profile: serializePortalProfile(auth.provider) });
}
