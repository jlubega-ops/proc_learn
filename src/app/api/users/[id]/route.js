import { NextResponse } from "next/server";
import { Role, UserAccountStatus } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * @param {{ params: Promise<{ id: string }> }} ctx
 */
export async function PATCH(request, ctx) {
  const actor = await getSessionUser();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const active = sessionActiveRole(actor);
  if (active !== Role.SYSTEM_ADMIN && active !== Role.EXAMINER) {
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
    select: { studentProfile: { select: { userId: true } } },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  const isStudent = Boolean(target.studentProfile);
  if (active === Role.EXAMINER && !isStudent) {
    return NextResponse.json(
      { error: "Examiners may only suspend or unsuspend student accounts." },
      { status: 403 },
    );
  }

  if (body.suspended) {
    const reason =
      typeof body?.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 1024)
        : "No reason provided.";
    await prisma.user.update({
      where: { id },
      data: {
        accountStatus: UserAccountStatus.SUSPENDED,
        suspendedReason: reason,
      },
    });
  } else {
    await prisma.user.update({
      where: { id },
      data: {
        accountStatus: UserAccountStatus.ACTIVE,
        suspendedReason: null,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
