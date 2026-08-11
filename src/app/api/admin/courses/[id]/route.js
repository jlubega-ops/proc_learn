import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { serializeCourse } from "@/lib/academic/academic-context";

export const runtime = "nodejs";

export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user || sessionActiveRole(user) !== Role.SYSTEM_ADMIN) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const existing = await prisma.course.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  /** @type {Record<string, string>} */
  const fieldErrors = {};
  const code =
    body?.code !== undefined
      ? String(body.code || "").trim().toUpperCase().slice(0, 32)
      : existing.code;
  const name =
    body?.name !== undefined ? String(body.name || "").trim().slice(0, 255) : existing.name;
  if (!code) fieldErrors.code = "Enter a course code.";
  if (!name) fieldErrors.name = "Enter a course name.";
  if (Object.keys(fieldErrors).length) {
    return NextResponse.json({ error: "Please fix the highlighted fields.", fieldErrors }, { status: 400 });
  }

  let programmeId = existing.programmeId;
  if (body?.programmeId !== undefined) {
    programmeId =
      typeof body.programmeId === "string" && body.programmeId.trim()
        ? body.programmeId.trim()
        : null;
    if (programmeId) {
      const programme = await prisma.programme.findUnique({ where: { id: programmeId } });
      if (!programme) {
        return NextResponse.json(
          { error: "Programme not found.", fieldErrors: { programmeId: "Choose a valid programme." } },
          { status: 400 },
        );
      }
    }
  }

  try {
    const row = await prisma.course.update({
      where: { id },
      data: {
        code,
        name,
        description:
          body?.description !== undefined
            ? String(body.description || "").trim().slice(0, 512) || null
            : undefined,
        programmeId,
        isActive: body?.isActive === undefined ? undefined : body.isActive !== false,
      },
      include: { programme: { select: { id: true, name: true, shortName: true } } },
    });

    await writeAuditLog({
      eventType: AuditEvent.COURSE_UPDATED,
      actorUserId: user.id,
      meta: { courseId: row.id, code: row.code, name: row.name },
    });

    return NextResponse.json({ course: serializeCourse(row) });
  } catch (e) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "A course with this code already exists.", fieldErrors: { code: "Code already in use." } },
        { status: 400 },
      );
    }
    throw e;
  }
}
