import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth/session";
import { buildIronSessionOptions } from "@/lib/auth/session-options";
import { prisma } from "@/lib/prisma";
import { grantedRoles, pickHighestGrantedRole } from "@/lib/roles";

export const runtime = "nodejs";

export async function PATCH(request) {
  if (!buildIronSessionOptions()) {
    return NextResponse.json(
      { error: "Server auth is not configured (SESSION_SECRET)." },
      { status: 503 },
    );
  }

  const session = await getAppSession();
  if (!session) {
    return NextResponse.json(
      { error: "Server auth is not configured (SESSION_SECRET)." },
      { status: 503 },
    );
  }

  const userId = session.userId;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const theme = body?.theme;
  if (theme !== "light" && theme !== "dark") {
    return NextResponse.json({ error: "Invalid theme value." }, { status: 400 });
  }

  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: true },
  });
  const initialActive = pickHighestGrantedRole(grantedRoles(u?.userRoles ?? []));

  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, theme, activeRole: initialActive },
    update: { theme },
  });

  return NextResponse.json({ ok: true, theme });
}
