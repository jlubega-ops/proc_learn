import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { serializeClassCohort } from "@/lib/academic/academic-context";

export const runtime = "nodejs";

const cohortInclude = {
  course: { include: { programme: { select: { id: true, name: true, shortName: true } } } },
  academicYear: true,
  semester: { include: { academicYear: true } },
};

export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user || sessionActiveRole(user) !== Role.SYSTEM_ADMIN) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const existing = await prisma.classCohort.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  /** @type {Record<string, string>} */
  const fieldErrors = {};
  const name =
    body?.name !== undefined ? String(body.name || "").trim().slice(0, 128) : existing.name;
  if (!name) fieldErrors.name = "Enter a class name.";
  if (Object.keys(fieldErrors).length) {
    return NextResponse.json({ error: "Please fix the highlighted fields.", fieldErrors }, { status: 400 });
  }

  let courseId = existing.courseId;
  let academicYearId = existing.academicYearId;
  let semesterId = existing.semesterId;

  if (body?.courseId !== undefined) {
    courseId = String(body.courseId || "").trim();
    if (!courseId) fieldErrors.courseId = "Choose a course.";
  }
  if (body?.academicYearId !== undefined) {
    academicYearId = String(body.academicYearId || "").trim();
    if (!academicYearId) fieldErrors.academicYearId = "Choose an academic year.";
  }
  if (body?.semesterId !== undefined) {
    semesterId =
      typeof body.semesterId === "string" && body.semesterId.trim()
        ? body.semesterId.trim()
        : null;
  }
  if (Object.keys(fieldErrors).length) {
    return NextResponse.json({ error: "Please fix the highlighted fields.", fieldErrors }, { status: 400 });
  }

  if (courseId !== existing.courseId) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json(
        { error: "Course not found.", fieldErrors: { courseId: "Choose a valid course." } },
        { status: 400 },
      );
    }
  }
  if (academicYearId !== existing.academicYearId) {
    const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
    if (!year) {
      return NextResponse.json(
        {
          error: "Academic year not found.",
          fieldErrors: { academicYearId: "Choose a valid academic year." },
        },
        { status: 400 },
      );
    }
  }
  if (semesterId) {
    const semester = await prisma.semester.findFirst({
      where: { id: semesterId, academicYearId },
    });
    if (!semester) {
      return NextResponse.json(
        {
          error: "Semester does not belong to the selected academic year.",
          fieldErrors: { semesterId: "Choose a semester for this academic year." },
        },
        { status: 400 },
      );
    }
  }

  const row = await prisma.classCohort.update({
    where: { id },
    data: {
      name,
      code:
        body?.code !== undefined
          ? String(body.code || "").trim().slice(0, 32) || null
          : undefined,
      courseId,
      academicYearId,
      semesterId,
      isActive: body?.isActive === undefined ? undefined : body.isActive !== false,
    },
    include: cohortInclude,
  });

  await writeAuditLog({
    eventType: AuditEvent.CLASS_COHORT_UPDATED,
    actorUserId: user.id,
    meta: {
      classCohortId: row.id,
      name: row.name,
      courseId: row.courseId,
      academicYearId: row.academicYearId,
    },
  });

  return NextResponse.json({ classCohort: serializeClassCohort(row) });
}
