import { NextResponse } from "next/server";
import { mutateActiveAppSession } from "@/lib/auth/session";
import { buildIronSessionOptions } from "@/lib/auth/session-options";
import { buildSessionPayloadForUserId } from "@/lib/auth/session-payload";
import { prisma } from "@/lib/prisma";
import { canActivateRole, grantedRoles } from "@/lib/roles";

export const runtime = "nodejs";

export async function POST(request) {
  if (!buildIronSessionOptions()) {
    return NextResponse.json(
      { error: "Server auth is not configured (SESSION_SECRET)." },
      { status: 503 },
    );
  }

  const session = await mutateActiveAppSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const nextRole = typeof body?.role === "string" ? body.role.trim() : "";
  if (!nextRole) {
    return NextResponse.json({ error: "Role is required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { userRoles: true, settings: true },
  });

  if (!user?.settings) {
    return NextResponse.json({ error: "Account is not ready." }, { status: 400 });
  }

  const g = grantedRoles(user.userRoles);
  if (!canActivateRole(g, nextRole)) {
    return NextResponse.json({ error: "Forbidden role." }, { status: 403 });
  }

  await prisma.userSettings.update({
    where: { userId: user.id },
    data: { activeRole: nextRole },
  });

  const payload = await buildSessionPayloadForUserId(user.id);
  return NextResponse.json({ ok: true, ...payload });
}
