import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { AuthTokenType, UserAccountStatus } from "@prisma/client";
import { findValidAuthToken } from "@/lib/auth-token";
import { validateNewPassword } from "@/lib/password-policy";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";

export const runtime = "nodejs";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!token) {
    return NextResponse.json({ error: "Reset token is required." }, { status: 400 });
  }

  const pw = validateNewPassword(password);
  if (!pw.ok) {
    return NextResponse.json({ error: pw.error }, { status: 400 });
  }

  const row = await findValidAuthToken(token, AuthTokenType.PASSWORD_RESET);
  if (!row) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired." },
      { status: 400 },
    );
  }

  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request);
  const passwordHash = await bcrypt.hash(password, 12);

  const userBefore = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { activatedAt: true, accountStatus: true },
  });
  if (!userBefore || userBefore.accountStatus === UserAccountStatus.SUSPENDED) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired." },
      { status: 400 },
    );
  }
  const activateViaReset =
    Boolean(userBefore) &&
    (!userBefore.activatedAt || userBefore.accountStatus === UserAccountStatus.PENDING_ACTIVATION);

  try {
    await prisma.$transaction(async (tx) => {
      const still = await tx.authToken.findFirst({
        where: {
          id: row.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!still) throw new Error("token_used");
      await tx.authToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: row.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          sessionVersion: { increment: 1 },
          ...(activateViaReset
            ? {
                accountStatus: UserAccountStatus.ACTIVE,
                activatedAt: new Date(),
              }
            : {}),
        },
      });
      if (activateViaReset) {
        await tx.authToken.updateMany({
          where: {
            userId: row.userId,
            type: AuthTokenType.ACCOUNT_ACTIVATION,
            usedAt: null,
          },
          data: { usedAt: new Date() },
        });
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "token_used") {
      return NextResponse.json(
        { error: "This reset link has already been used." },
        { status: 400 },
      );
    }
    throw e;
  }

  await writeAuditLog({
    eventType: AuditEvent.PASSWORD_RESET_COMPLETED,
    targetUserId: row.userId,
    ip,
    userAgent,
    meta: activateViaReset ? { activatedAccount: true } : {},
  });

  return NextResponse.json({ ok: true });
}
