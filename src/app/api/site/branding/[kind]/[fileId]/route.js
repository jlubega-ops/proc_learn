import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { findBrandingFile, getSiteBranding, isBrandingKind } from "@/lib/site-branding";

export const runtime = "nodejs";

/**
 * Public logo / background delivery (sign-in and maintenance pages need it before login).
 * Each upload gets a new id, so a matching id is cached forever; an old id redirects to the current image.
 */
export async function GET(request, context) {
  const { kind, fileId } = await context.params;
  if (!isBrandingKind(kind) || !/^[a-z]+-[0-9a-f-]{36}$/i.test(String(fileId || ""))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const file = await findBrandingFile(kind, fileId).catch(() => null);
  if (!file) {
    const branding = await getSiteBranding();
    const current = kind === "logo" ? branding.logoUrl : branding.backgroundUrl;
    return NextResponse.redirect(new URL(current, request.url), {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const buf = await readFile(file.absolute);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
