import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ ok: true });
  }
  session.destroy();
  await session.save();
  return NextResponse.json({ ok: true });
}
