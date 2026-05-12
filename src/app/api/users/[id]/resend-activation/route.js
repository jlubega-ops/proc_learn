import { NextResponse } from "next/server";
import { AuthTokenType, Role, UserAccountStatus } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canManageStudents } from "@/lib/api/student-scope";
import { createAuthTokenRecord } from "@/lib/auth-token";
import { sendAccountActivationEmail } from "@/lib/invite-mail";
import { formatUserDisplayName } from "@/lib/user-display";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ACTIVATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {{ params: Promise<{ id: string }> }} ctx
 */
export async function POST(_request, ctx) {
  const actor = await getSessionUser();
  if (!actor) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    include: { studentProfile: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const activeRole = sessionActiveRole(actor);
  const isStudent = Boolean(user.studentProfile);
  if (isStudent) {
    if (!canManageStudents(activeRole)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  } else if (activeRole !== Role.SYSTEM_ADMIN) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (user.accountStatus === UserAccountStatus.SUSPENDED) {
    return NextResponse.json(
      { error: "Suspended users cannot receive activation mail." },
      { status: 400 },
    );
  }

  if (user.activatedAt) {
    return NextResponse.json(
      { error: "This account is already activated." },
      { status: 400 },
    );
  }

  const { rawToken } = await createAuthTokenRecord(
    user.id,
    AuthTokenType.ACCOUNT_ACTIVATION,
    ACTIVATION_MS,
  );

  await sendAccountActivationEmail({
    email: user.email,
    rawToken,
    displayName: formatUserDisplayName(user),
  });

  return NextResponse.json({ ok: true });
}
