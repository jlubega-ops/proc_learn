import { NextResponse } from "next/server";
import { mutateActiveAppSession } from "@/lib/auth/session";
import { buildIronSessionOptions } from "@/lib/auth/session-options";
import { SESSION_IDLE_MINUTES } from "@/lib/appConfig";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";

export const runtime = "nodejs";

/** Lightweight activity ping — slides the idle session window. */
export async function POST(request) {
  if (!buildIronSessionOptions()) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 503 });
  }

  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request);
  const session = await mutateActiveAppSession({ touch: true, ip, userAgent });
  if (!session) {
    return NextResponse.json(
      { ok: false, authenticated: false, reason: "idle_expired" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    ok: true,
    authenticated: true,
    sessionIdleMinutes: SESSION_IDLE_MINUTES,
  });
}
