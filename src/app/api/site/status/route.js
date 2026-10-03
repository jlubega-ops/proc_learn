import { NextResponse } from "next/server";
import { readSiteSettings } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await readSiteSettings();
  return NextResponse.json(
    { maintenance: Boolean(settings.maintenanceEnabled) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
