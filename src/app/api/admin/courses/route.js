import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { serializeCourse } from "@/lib/academic/academic-context";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const active = sessionActiveRole(user);
  if (![Role.SYSTEM_ADMIN, Role.EXAMINER].includes(active)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const rows = await prisma.course.findMany({
    include: { programme: { select: { id: true, name: true, shortName: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ courses: rows.map(serializeCourse) });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || sessionActiveRole(user) !== Role.SYSTEM_ADMIN) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  /** @type {Record<string, string>} */
  const fieldErrors = {};
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase().slice(0, 32) : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 255) : "";
  const description =
    typeof body?.description === "string" ? body.description.trim().slice(0, 512) || null : null;
  const programmeId =
    typeof body?.programmeId === "string" && body.programmeId.trim()
      ? body.programmeId.trim()
      : null;
  if (!code) fieldErrors.code = "Enter a course code.";
  if (!name) fieldErrors.name = "Enter a course name.";
  if (Object.keys(fieldErrors).length) {
    return NextResponse.json({ error: "Please fix the highlighted fields.", fieldErrors }, { status: 400 });
  }

  if (programmeId) {
    const programme = await prisma.programme.findUnique({ where: { id: programmeId } });
    if (!programme) {
      return NextResponse.json(
        { error: "Programme not found.", fieldErrors: { programmeId: "Choose a valid programme." } },
        { status: 400 },
      );
    }
  }

  try {
    const row = await prisma.course.create({
      data: {
        code,
        name,
        description,
        programmeId,
        isActive: body?.isActive === false ? false : true,
      },
      include: { programme: { select: { id: true, name: true, shortName: true } } },
    });

    await writeAuditLog({
      eventType: AuditEvent.COURSE_CREATED,
      actorUserId: user.id,
      meta: { courseId: row.id, code: row.code, name: row.name },
    });

    return NextResponse.json({ course: serializeCourse(row) }, { status: 201 });
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
