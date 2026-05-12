import { NextResponse } from "next/server";
import { AuthTokenType, UserAccountStatus } from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { createAuthTokenRecord } from "@/lib/auth-token";
import { buildPasswordResetUrl } from "@/lib/auth-links";
import { sendPasswordResetEmail } from "@/lib/mail/branded-send";
import { createInAppNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/validation/email";
import { schoolEmailFieldError } from "@/lib/validation/school-email";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";

export const runtime = "nodejs";

const RESET_MS = 60 * 60 * 1000;

const PUBLIC_MESSAGE =
  "If an account exists for that email, we sent password reset instructions.";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });
  }

  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request);

  const emailFieldError = schoolEmailFieldError(body?.email);
  if (emailFieldError) {
    return NextResponse.json(
      { error: "Validation failed.", fields: { email: emailFieldError } },
      { status: 400 },
    );
  }

  const email = normalizeEmail(body?.email);

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      accountStatus: true,
      activatedAt: true,
    },
  });

  if (user?.accountStatus === UserAccountStatus.SUSPENDED) {
    await writeAuditLog({
      eventType: AuditEvent.PASSWORD_RESET_REQUESTED,
      targetUserId: user.id,
      ip,
      userAgent,
      meta: { email, outcome: "suspended_no_mail" },
    });
    return NextResponse.json(
      {
        error:
          "This account has been suspended. Password reset is not available. Please contact support if you think this is a mistake.",
      },
      { status: 403 },
    );
  }

  if (!user) {
    await writeAuditLog({
      eventType: AuditEvent.PASSWORD_RESET_REQUESTED,
      targetUserId: null,
      ip,
      userAgent,
      meta: { email, outcome: "no_mail" },
    });
    return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });
  }

  const { rawToken } = await createAuthTokenRecord(
    user.id,
    AuthTokenType.PASSWORD_RESET,
    RESET_MS,
  );
  const url = buildPasswordResetUrl(rawToken);

  await writeAuditLog({
    eventType: AuditEvent.PASSWORD_RESET_REQUESTED,
    targetUserId: user.id,
    ip,
    userAgent,
    meta: { email: user.email, outcome: "issued" },
  });

  const needsActivation =
    !user.activatedAt || user.accountStatus === UserAccountStatus.PENDING_ACTIVATION;
  await createInAppNotification({
    userId: user.id,
    type: "PASSWORD_RESET",
    title: "Password reset requested",
    body: needsActivation
      ? "Someone requested a password reset for your account. Use the link in your email to choose a password — that will also activate your account so you can sign in. The link expires in one hour. If this was not you, secure your inbox and contact support."
      : "Someone requested a password reset for your account. If this was not you, secure your email inbox and contact support. The reset link in your email expires in one hour.",
  });

  await sendPasswordResetEmail({ email: user.email, resetUrl: url });

  return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });
}
