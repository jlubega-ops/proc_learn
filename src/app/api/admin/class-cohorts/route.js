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

export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const active = sessionActiveRole(user);
  if (![Role.SYSTEM_ADMIN, Role.EXAMINER].includes(active)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const sp = new URL(request.url).searchParams;
  const academicYearId = sp.get("academicYearId")?.trim() || "";
  const courseId = sp.get("courseId")?.trim() || "";

  const rows = await prisma.classCohort.findMany({
    where: {
      ...(academicYearId ? { academicYearId } : {}),
      ...(courseId ? { courseId } : {}),
    },
    include: cohortInclude,
    orderBy: [{ academicYear: { label: "desc" } }, { name: "asc" }],
  });
  return NextResponse.json({ classCohorts: rows.map(serializeClassCohort) });
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
  const courseId = typeof body?.courseId === "string" ? body.courseId.trim() : "";
  const academicYearId =
    typeof body?.academicYearId === "string" ? body.academicYearId.trim() : "";
  const semesterId =
    typeof body?.semesterId === "string" && body.semesterId.trim()
      ? body.semesterId.trim()
      : null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 128) : "";
  const code =
    typeof body?.code === "string" ? body.code.trim().slice(0, 32) || null : null;

  if (!courseId) fieldErrors.courseId = "Choose a course.";
  if (!academicYearId) fieldErrors.academicYearId = "Choose an academic year.";
  if (!name) fieldErrors.name = "Enter a class name.";
  if (Object.keys(fieldErrors).length) {
    return NextResponse.json({ error: "Please fix the highlighted fields.", fieldErrors }, { status: 400 });
  }

  const [course, year] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId } }),
    prisma.academicYear.findUnique({ where: { id: academicYearId } }),
  ]);
  if (!course) {
    return NextResponse.json(
      { error: "Course not found.", fieldErrors: { courseId: "Choose a valid course." } },
      { status: 400 },
    );
  }
  if (!year) {
    return NextResponse.json(
      { error: "Academic year not found.", fieldErrors: { academicYearId: "Choose a valid academic year." } },
      { status: 400 },
    );
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

  const row = await prisma.classCohort.create({
    data: {
      courseId,
      academicYearId,
      semesterId,
      name,
      code,
      isActive: body?.isActive === false ? false : true,
    },
    include: cohortInclude,
  });

  await writeAuditLog({
    eventType: AuditEvent.CLASS_COHORT_CREATED,
    actorUserId: user.id,
    meta: {
      classCohortId: row.id,
      name: row.name,
      courseId: row.courseId,
      academicYearId: row.academicYearId,
    },
  });

  return NextResponse.json({ classCohort: serializeClassCohort(row) }, { status: 201 });
}
