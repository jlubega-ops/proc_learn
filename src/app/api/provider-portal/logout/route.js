import { NextResponse } from "next/server";
import { OrgProviderStatus } from "@prisma/client";
import { getAppSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { auditProviderPortalAccess } from "@/lib/projects/provider-portal";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";
import { SIGN_OUT_RESPONSE_HEADERS } from "@/lib/auth/sign-out-headers";

export const runtime = "nodejs";

/**
 * @param {Request} request
 */
async function endSession(request, { staleOnly = false } = {}) {
  const session = await getAppSession();
  if (!session?.providerId) return true;
  const provider = await prisma.projectOrgProvider.findUnique({
    where: { id: session.providerId },
    select: { id: true, projectId: true, status: true, project: { select: { isPublished: true } } },
  });
  if (staleOnly && provider && provider.status === OrgProviderStatus.ACTIVE && provider.project?.isPublished) {
    return false;
  }
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
  return true;
}

export async function POST(request) {
  await endSession(request);
  return NextResponse.json({ ok: true }, { headers: SIGN_OUT_RESPONSE_HEADERS });
}

/** Clears stale provider sessions only, so a cross-site GET cannot sign out an active provider. */
export async function GET(request) {
  const ended = await endSession(request, { staleOnly: true });
  return NextResponse.redirect(new URL(ended ? "/login" : "/provider-portal", request.url));
}
