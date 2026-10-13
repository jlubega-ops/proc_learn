import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { getSessionUser } from "@/lib/api/get-session-user";
import { mutateActiveAppSession } from "@/lib/auth/session";
import { buildIronSessionOptions } from "@/lib/auth/session-options";
import { prisma } from "@/lib/prisma";
import { resolveStoredFilePath } from "@/lib/upload-path";

export const runtime = "nodejs";

/**
 * Protected binary delivery. Files live under PROC_LEARN_UPLOAD_ROOT only (never in /public).
 */
export async function GET(_request, context) {
  if (!buildIronSessionOptions()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const session = await mutateActiveAppSession();
  if (!session?.userId || !(await getSessionUser())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const params = await context.params;
  const id = params?.id;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const media = await prisma.mediaObject.findFirst({
    where: { id, ownerUserId: session.userId },
  });

  if (!media) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const abs = resolveStoredFilePath(media.storageKey);
  if (!abs) {
    return NextResponse.json({ error: "Invalid storage key." }, { status: 400 });
  }

  try {
    const buf = await readFile(abs);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": media.mimeType || "application/octet-stream",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing." }, { status: 404 });
  }
}
