import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { UserAccountStatus } from "@prisma/client";
import { messageForActivationTokenCode } from "@/lib/auth-activation-messages";
import { inspectActivationToken } from "@/lib/auth-token";
import { validateNewPassword } from "@/lib/password-policy";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Validate activation token for the UI (no password required).
 * Query: `t` or `token` — same as the link in emails.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const raw = (url.searchParams.get("t") || url.searchParams.get("token") || "").trim();
  if (!raw) {
    return NextResponse.json({
      ok: false,
      code: "invalid",
      message: messageForActivationTokenCode("invalid"),
    });
  }

  const status = await inspectActivationToken(raw);
  if (!status.ok) {
    return NextResponse.json({
      ok: false,
      code: status.code,
      message: messageForActivationTokenCode(status.code),
    });
  }

  return NextResponse.json({ ok: true });
}

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
    return NextResponse.json(
      {
        error: messageForActivationTokenCode("invalid"),
        code: "invalid",
      },
      { status: 400 },
    );
  }

  const pw = validateNewPassword(password);
  if (!pw.ok) {
    return NextResponse.json({ error: pw.error }, { status: 400 });
  }

  const status = await inspectActivationToken(token);
  if (!status.ok) {
    return NextResponse.json(
      {
        error: messageForActivationTokenCode(status.code),
        code: status.code,
      },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await prisma.$transaction(async (tx) => {
      const still = await tx.authToken.findFirst({
        where: {
          id: status.tokenId,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!still) {
        throw new Error("token_consumed");
      }
      await tx.authToken.update({
        where: { id: status.tokenId },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: status.userId },
        data: {
          passwordHash,
          accountStatus: UserAccountStatus.ACTIVE,
          activatedAt: new Date(),
          mustChangePassword: false,
        },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "token_consumed") {
      return NextResponse.json(
        {
          error: messageForActivationTokenCode("used"),
          code: "used",
        },
        { status: 400 },
      );
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
