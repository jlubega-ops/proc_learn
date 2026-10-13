import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth/session";
import { SIGN_OUT_RESPONSE_HEADERS } from "@/lib/auth/sign-out-headers";

export const runtime = "nodejs";

export async function POST() {
  const session = await getAppSession();
  if (session) {
    session.destroy();
    await session.save();
  }
  return NextResponse.json({ ok: true }, { headers: SIGN_OUT_RESPONSE_HEADERS });
}
