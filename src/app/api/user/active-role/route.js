import { NextResponse } from "next/server";
import { mutateActiveAppSession } from "@/lib/auth/session";
import { buildIronSessionOptions } from "@/lib/auth/session-options";
import { switchActiveRole } from "@/lib/academic/switch-active-role";

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
  const result = await switchActiveRole({
    userId: session.userId,
    nextRole,
    buildPayload: true,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, ...result.payload });
}
