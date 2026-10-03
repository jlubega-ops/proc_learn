import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { auditProviderPortalAccess } from "@/lib/projects/provider-portal";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";

export const runtime = "nodejs";

/**
 * @param {Request} request
 */
async function endSession(request) {
  const session = await getAppSession();
  if (!session?.providerId) return;
  const provider = await prisma.projectOrgProvider.findUnique({
    where: { id: session.providerId },
    select: { id: true, projectId: true },
  });
  session.destroy();
  await session.save();
  if (provider) {
    await auditProviderPortalAccess({
      projectId: provider.projectId,
      providerId: provider.id,
      event: "logout",
      ip: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
    });
  }
}

export async function POST(request) {
  await endSession(request);
  return NextResponse.json({ ok: true });
}

/** Used by the portal layout when a stale provider session must be cleared. */
export async function GET(request) {
  await endSession(request);
  return NextResponse.redirect(new URL("/login", request.url));
}
