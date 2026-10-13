import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { cachedRead } from "@/lib/server-cache";
import { cachedJson } from "@/lib/api/cached-json";
import {
  listConfiguredAcademicYears,
  serializeAcademicYear,
  validateAcademicYearInput,
} from "@/lib/academic/academic-context";

export const runtime = "nodejs";

export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const active = sessionActiveRole(user);
  if (![Role.SYSTEM_ADMIN, Role.EXAMINER].includes(active)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const academicYears = await cachedRead("academic-years:all", ["AcademicYear"], () =>
    listConfiguredAcademicYears(),
  );
  return cachedJson(request, { academicYears }, { revalidate: true });
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

  const parsed = validateAcademicYearInput({
    label: body?.label,
    startDate: body?.startDate,
    endDate: body?.endDate,
    description: body?.description,
  });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: parsed.fieldErrors },
      { status: 400 },
    );
  }

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

  const makeCurrent = body?.isCurrent === true;
  const count = await prisma.academicYear.count();
  const shouldBeCurrent = makeCurrent || count === 0;

  let row;
  if (shouldBeCurrent) {
    row = await prisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({ data: { isCurrent: false } });
      return tx.academicYear.create({
        data: {
          label: parsed.label,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          description: parsed.description,
          isCurrent: true,
        },
      });
    });
  } else {
    row = await prisma.academicYear.create({
      data: {
        label: parsed.label,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        description: parsed.description,
        isCurrent: false,
      },
    });
  }

  await writeAuditLog({
    eventType: AuditEvent.ACADEMIC_YEAR_CREATED,
    actorUserId: user.id,
    meta: {
      academicYearId: row.id,
      label: row.label,
      isCurrent: row.isCurrent,
    },
  });

  if (row.isCurrent) {
    await writeAuditLog({
      eventType: AuditEvent.ACADEMIC_YEAR_SET_CURRENT,
      actorUserId: user.id,
      meta: { academicYearId: row.id, label: row.label },
    });
  }

  return NextResponse.json({ academicYear: serializeAcademicYear(row) }, { status: 201 });
}
