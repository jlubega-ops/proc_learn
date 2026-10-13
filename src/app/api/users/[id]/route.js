import { NextResponse } from "next/server";
import { Role, UserAccountStatus } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

/**
 * @param {{ params: Promise<{ id: string }> }} ctx
 */
export async function PATCH(request, ctx) {
  const actor = await getSessionUser();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (sessionActiveRole(actor) !== Role.SYSTEM_ADMIN) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  if (id === actor.id) {
    return NextResponse.json(
      { error: "You cannot change your own suspension state here." },
      { status: 400 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body?.suspended !== "boolean") {
    return NextResponse.json({ error: "Field `suspended` (boolean) is required." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, activatedAt: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const reason =
    typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 1024) : "";
  if (body.suspended && !reason) {
    return NextResponse.json(
      { error: "Enter a reason.", fieldErrors: { reason: "Enter a reason." } },
      { status: 400 },
    );
  }

  if (body.suspended) {
    if (target.id === actor.id) {
      return NextResponse.json({ error: "You cannot suspend your own account." }, { status: 400 });
    }
    const otherAdmins = await prisma.userRole.count({
      where: {
        role: Role.SYSTEM_ADMIN,
        userId: { not: target.id },
        user: { accountStatus: { not: UserAccountStatus.SUSPENDED } },
      },
    });
    const targetIsAdmin = await prisma.userRole.count({
      where: { role: Role.SYSTEM_ADMIN, userId: target.id },
    });
    if (targetIsAdmin && !otherAdmins) {
      return NextResponse.json({ error: "Keep at least one system admin." }, { status: 400 });
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          accountStatus: UserAccountStatus.SUSPENDED,
          suspendedReason: reason,
          sessionVersion: { increment: 1 },
        },
      }),
      prisma.authToken.updateMany({
        where: { userId: id, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
  } else {
    await prisma.user.update({
      where: { id },
      data: {
        accountStatus: target.activatedAt
          ? UserAccountStatus.ACTIVE
          : UserAccountStatus.PENDING_ACTIVATION,
        suspendedReason: null,
      },
    });
  }

  await writeAuditLog({
    eventType: body.suspended ? AuditEvent.USER_SUSPENDED : AuditEvent.USER_UNSUSPENDED,
    actorUserId: actor.id,
    targetUserId: target.id,
    meta: { email: target.email, ...(body.suspended ? { reason } : {}) },
  });

  return NextResponse.json({ ok: true });
}
