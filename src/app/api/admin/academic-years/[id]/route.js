import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import {
  serializeAcademicYear,
  setCurrentAcademicYear,
  validateAcademicYearInput,
} from "@/lib/academic/academic-context";

export const runtime = "nodejs";

export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user || sessionActiveRole(user) !== Role.SYSTEM_ADMIN) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const existing = await prisma.academicYear.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body?.setCurrent === true) {
    const row = await setCurrentAcademicYear(prisma, id);
    await writeAuditLog({
      eventType: AuditEvent.ACADEMIC_YEAR_SET_CURRENT,
      actorUserId: user.id,
      meta: { academicYearId: row.id, label: row.label },
    });
    return NextResponse.json({ academicYear: serializeAcademicYear(row) });
  }

  const parsed = validateAcademicYearInput({
    label: body?.label !== undefined ? body.label : existing.label,
    startDate: body?.startDate !== undefined ? body.startDate : existing.startDate,
    endDate: body?.endDate !== undefined ? body.endDate : existing.endDate,
    description: body?.description !== undefined ? body.description : existing.description,
  });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: parsed.fieldErrors },
      { status: 400 },
    );
  }

  if (parsed.label !== existing.label) {
    const clash = await prisma.academicYear.findUnique({ where: { label: parsed.label } });
    if (clash) {
      return NextResponse.json(
        {
          error: "An academic year with this label already exists.",
          fieldErrors: { label: "This academic year already exists." },
        },
        { status: 400 },
      );
    }
  }

  const row = await prisma.academicYear.update({
    where: { id },
    data: {
      label: parsed.label,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      description: parsed.description,
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.ACADEMIC_YEAR_UPDATED,
    actorUserId: user.id,
    meta: { academicYearId: row.id, label: row.label },
  });

  return NextResponse.json({ academicYear: serializeAcademicYear(row) });
}
