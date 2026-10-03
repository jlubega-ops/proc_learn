import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProviderPortalSession, serializePortalProvider } from "@/lib/projects/provider-portal";
import { SESSION_IDLE_MINUTES } from "@/lib/appConfig";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireProviderPortalSession(prisma);
  if (!auth.ok) return NextResponse.json({ authenticated: false, error: auth.error }, { status: auth.status });
  return NextResponse.json({
    authenticated: true,
    provider: serializePortalProvider(auth.provider),
    sessionIdleMinutes: SESSION_IDLE_MINUTES,
  });
}
