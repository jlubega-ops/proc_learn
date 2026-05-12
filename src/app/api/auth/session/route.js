import { NextResponse } from "next/server";
import { UserAccountStatus } from "@prisma/client";
import { getAppSession } from "@/lib/auth/session";
import { buildIronSessionOptions } from "@/lib/auth/session-options";
import { buildSessionPayloadForUserId } from "@/lib/auth/session-payload";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  if (!buildIronSessionOptions()) {
    return NextResponse.json({
      authenticated: false,
      reason: "missing_session_secret",
    });
  }

  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ authenticated: false });
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

  return NextResponse.json(payload);
}
