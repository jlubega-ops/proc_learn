import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import {
  activateSemester,
  serializeSemester,
} from "@/lib/academic/academic-context";
import { validateStartEndDateRange } from "@/lib/validation/date-range";
import { parseDateInputValue } from "@/lib/financial-year-dates";

export const runtime = "nodejs";

export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const active = sessionActiveRole(user);
  if (![Role.SYSTEM_ADMIN, Role.EXAMINER].includes(active)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const academicYearId = new URL(request.url).searchParams.get("academicYearId")?.trim() || "";
  const rows = await prisma.semester.findMany({
    where: academicYearId ? { academicYearId } : {},
    include: { academicYear: true },
    orderBy: [{ academicYear: { label: "desc" } }, { startDate: "asc" }],
  });
  return NextResponse.json({ semesters: rows.map(serializeSemester) });
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
  const academicYearId = typeof body?.academicYearId === "string" ? body.academicYearId.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 64) : "";
  if (!academicYearId) fieldErrors.academicYearId = "Choose an academic year.";
  if (!name) fieldErrors.name = "Enter a semester name.";
  const range = validateStartEndDateRange(body?.startDate, body?.endDate, { requireBoth: true });
  if (!range.ok) Object.assign(fieldErrors, range.fieldErrors || {});
  if (Object.keys(fieldErrors).length) {
    return NextResponse.json({ error: "Please fix the highlighted fields.", fieldErrors }, { status: 400 });
  }

  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) {
    return NextResponse.json(
      { error: "Academic year not found.", fieldErrors: { academicYearId: "Choose a valid academic year." } },
      { status: 400 },
    );
  }

  const makeActive = body?.isActive === true;
  const activeCount = await prisma.semester.count({ where: { isActive: true } });
  const shouldActivate = makeActive || activeCount === 0;

  let row;
  if (shouldActivate) {
    row = await prisma.$transaction(async (tx) => {
      await tx.semester.updateMany({ data: { isActive: false } });
      return tx.semester.create({
        data: {
          academicYearId,
          name,
          startDate: parseDateInputValue(body.startDate),
          endDate: parseDateInputValue(body.endDate),
          isActive: true,
        },
        include: { academicYear: true },
      });
    });
  } else {
    row = await prisma.semester.create({
      data: {
        academicYearId,
        name,
        startDate: parseDateInputValue(body.startDate),
        endDate: parseDateInputValue(body.endDate),
        isActive: false,
      },
      include: { academicYear: true },
    });
  }

  await writeAuditLog({
    eventType: AuditEvent.SEMESTER_CREATED,
    actorUserId: user.id,
    meta: {
      semesterId: row.id,
      academicYearId: row.academicYearId,
      name: row.name,
      isActive: row.isActive,
    },
  });
  if (row.isActive) {
    await writeAuditLog({
      eventType: AuditEvent.SEMESTER_ACTIVATED,
      actorUserId: user.id,
      meta: { semesterId: row.id, name: row.name, academicYearId: row.academicYearId },
    });
  }

  return NextResponse.json({ semester: serializeSemester(row) }, { status: 201 });
}
