import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { activateSemester, serializeSemester } from "@/lib/academic/academic-context";
import { validateStartEndDateRange } from "@/lib/validation/date-range";
import { parseDateInputValue, toDateInputValue } from "@/lib/financial-year-dates";

export const runtime = "nodejs";

export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user || sessionActiveRole(user) !== Role.SYSTEM_ADMIN) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const existing = await prisma.semester.findUnique({
    where: { id },
    include: { academicYear: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body?.activate === true) {
    const row = await activateSemester(prisma, id);
    await writeAuditLog({
      eventType: AuditEvent.SEMESTER_ACTIVATED,
      actorUserId: user.id,
      meta: {
        semesterId: row.id,
        name: row.name,
        academicYearId: row.academicYearId,
      },
    });
    return NextResponse.json({ semester: serializeSemester(row) });
  }

  /** @type {Record<string, string>} */
  const fieldErrors = {};
  const name =
    body?.name !== undefined
      ? String(body.name || "").trim().slice(0, 64)
      : existing.name;
  if (!name) fieldErrors.name = "Enter a semester name.";
  const startRaw = body?.startDate !== undefined ? body.startDate : toDateInputValue(existing.startDate);
  const endRaw = body?.endDate !== undefined ? body.endDate : toDateInputValue(existing.endDate);
  const range = validateStartEndDateRange(startRaw, endRaw, { requireBoth: true });
  if (!range.ok) Object.assign(fieldErrors, range.fieldErrors || {});
  if (Object.keys(fieldErrors).length) {
    return NextResponse.json({ error: "Please fix the highlighted fields.", fieldErrors }, { status: 400 });
  }

  const row = await prisma.semester.update({
    where: { id },
    data: {
      name,
      startDate: parseDateInputValue(startRaw),
      endDate: parseDateInputValue(endRaw),
    },
    include: { academicYear: true },
  });

  await writeAuditLog({
    eventType: AuditEvent.SEMESTER_UPDATED,
    actorUserId: user.id,
    meta: { semesterId: row.id, name: row.name, academicYearId: row.academicYearId },
  });

  return NextResponse.json({ semester: serializeSemester(row) });
}
