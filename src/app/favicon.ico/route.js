import { NextResponse } from "next/server";
import { getSiteBranding } from "@/lib/site-branding";

export const runtime = "nodejs";

/** Browsers that request /favicon.ico directly get the current site logo. */
export async function GET(request) {
  const { logoUrl } = await getSiteBranding();
  const target = new URL(`/_next/image?url=${encodeURIComponent(logoUrl)}&w=64&q=75`, request.url);
  return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "public, max-age=3600" } });
}
