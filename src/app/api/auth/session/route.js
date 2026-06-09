import { NextResponse } from "next/server";
import { UserAccountStatus } from "@prisma/client";
import { getAppSession } from "@/lib/auth/session";
import { expireSessionIfIdle } from "@/lib/auth/session-idle";
import { buildIronSessionOptions } from "@/lib/auth/session-options";
import { buildSessionPayloadForUserId } from "@/lib/auth/session-payload";
import { buildSessionPayloadForOrgUserId } from "@/lib/auth/org-session-payload";
import { SESSION_IDLE_MINUTES } from "@/lib/appConfig";
import { prisma } from "@/lib/prisma";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";

export const runtime = "nodejs";

export async function GET(request) {
  if (!buildIronSessionOptions()) {
    return NextResponse.json({
      authenticated: false,
      reason: "missing_session_secret",
    });
  }

  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request);
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  if (!session.userId && !session.orgUserId) {
    return NextResponse.json({ authenticated: false });
  }

  const idle = await expireSessionIfIdle(session, { ip, userAgent });
  if (idle.expired) {
    await session.save();
    return NextResponse.json({
      authenticated: false,
      reason: "idle_expired",
      sessionIdleMinutes: SESSION_IDLE_MINUTES,
    });
  }
  if (idle.migrated) {
    await session.save();
  }

  if (session.orgUserId) {
    const payload = await buildSessionPayloadForOrgUserId(session.orgUserId);
    if (!payload.authenticated) {
      session.destroy();
      await session.save();
    }
    return NextResponse.json({
      ...payload,
      sessionIdleMinutes: SESSION_IDLE_MINUTES,
    });
  }

  const userId = session.userId;
  if (!userId) {
    return NextResponse.json({ authenticated: false });
  }

  const statusRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountStatus: true },
  });
  if (statusRow?.accountStatus === UserAccountStatus.SUSPENDED) {
    session.destroy();
    await session.save();
    return NextResponse.json({ authenticated: false });
  }

  const payload = await buildSessionPayloadForUserId(userId);
  if (!payload.authenticated) {
    session.destroy();
    await session.save();
  }

  return NextResponse.json({
    ...payload,
    sessionIdleMinutes: SESSION_IDLE_MINUTES,
  });
}
