import { randomUUID } from "crypto";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { RATE_LIMIT_MESSAGE, hitRateLimit } from "@/lib/rate-limit";
import { getUploadRoot } from "@/lib/upload-path";

export const runtime = "nodejs";

const ALLOWED = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const UPLOAD_ROLES = new Set([Role.STUDENT, Role.EXAMINER]);

function extFromMime(mime) {
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/msword") return "doc";
  return "docx";
}

/** File signature must match the declared type (PDF, OLE2 .doc, ZIP .docx). */
function signatureMatches(mime, buf) {
  if (mime === "application/pdf") return buf.subarray(0, 5).toString("latin1") === "%PDF-";
  if (mime === "application/msword") {
    return buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  }
  return buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!UPLOAD_ROLES.has(sessionActiveRole(user))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const limited = hitRateLimit(`media-upload:${user.id}`, { limit: 30, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart request." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required." }, { status: 400 });
  }

  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Only PDF or Word documents are allowed." },
      { status: 400 },
    );
  }
  if (file.size <= 0 || file.size > 15 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File must be between 1 byte and 15MB." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!signatureMatches(file.type, buffer)) {
    return NextResponse.json(
      { error: "Only PDF or Word documents are allowed." },
      { status: 400 },
    );
  }
  const root = getUploadRoot();
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ext = extFromMime(file.type);
  const fileName = `${randomUUID()}.${ext}`;
  const storageKey = path.join("project-question", yyyy, mm, fileName);
  const absolute = path.resolve(root, storageKey);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, buffer);

  const media = await prisma.mediaObject.create({
    data: {
      ownerUserId: user.id,
      purpose: "project-question",
      mimeType: file.type,
      storageKey,
    },
  });

  return NextResponse.json({
    mediaId: media.id,
    url: `/api/media/${media.id}`,
    mimeType: media.mimeType,
    fileName: file.name,
  });
}

