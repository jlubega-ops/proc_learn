import { NextResponse } from "next/server";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canManageStudents } from "@/lib/api/student-scope";
import { isAllowedAcademicYearLabel } from "@/lib/academic-years";
import { isStudentMubsEmail, isValidStudentNumberDigits } from "@/lib/mubs-email";
import { parseOptionalMaleFemaleSex } from "@/lib/validation/sex-male-female";
import { normalizeProfilePhotoInput } from "@/lib/profile-photo-url";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyAllSystemAdmins } from "@/lib/notify-system-admins";
import { formatUserDisplayName } from "@/lib/user-display";
import { prisma } from "@/lib/prisma";
import { ensureEnrollmentFromProfileLabel } from "@/lib/academic/student-enrollment";

export const runtime = "nodejs";

/**
 * @param {{ params: Promise<{ id: string }> }} ctx
 */
export async function PATCH(request, ctx) {
  const actor = await getSessionUser();
  const active = sessionActiveRole(actor);
  if (!actor || !canManageStudents(active)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    include: { studentProfile: true, userRoles: true },
  });
  if (!existing?.studentProfile) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : undefined;
  const studentNumber =
    typeof body?.studentNumber === "string"
      ? body.studentNumber.replace(/\D/g, "")
      : undefined;
  const effectiveEmail = String(email ?? existing.email)
    .trim()
    .toLowerCase();
  const effectiveSn =
    studentNumber !== undefined && studentNumber !== ""
      ? studentNumber
      : existing.studentProfile.studentNumber;

  if (email !== undefined && !isStudentMubsEmail(email)) {
    return NextResponse.json(
      { error: "Student email must match digits@mubs.ac.ug." },
      { status: 400 },
    );
  }
  if (!isStudentMubsEmail(effectiveEmail)) {
    return NextResponse.json(
      { error: "Student email must match digits@mubs.ac.ug." },
      { status: 400 },
    );
  }
  if (studentNumber !== undefined && !isValidStudentNumberDigits(studentNumber)) {
    return NextResponse.json(
      { error: "Student number must be 1–32 digits." },
      { status: 400 },
    );
  }
  if (!isValidStudentNumberDigits(effectiveSn)) {
    return NextResponse.json(
      { error: "Student number must be 1–32 digits." },
      { status: 400 },
    );
  }

  const firstName =
    typeof body?.firstName === "string" ? body.firstName.trim() : undefined;
  const lastName =
    typeof body?.lastName === "string" ? body.lastName.trim() : undefined;
  const middleName =
    body?.middleName === undefined
      ? undefined
      : String(body.middleName || "").trim() || null;
  const sex = body?.sex !== undefined ? parseOptionalMaleFemaleSex(body.sex) : undefined;
  if (sex === undefined && body?.sex !== undefined && body?.sex !== null && body?.sex !== "") {
    return NextResponse.json({ error: "Invalid sex value." }, { status: 400 });
  }
  const profilePhotoUrl =
    body?.profilePhotoUrl !== undefined
      ? normalizeProfilePhotoInput(body.profilePhotoUrl)
      : undefined;

  const registrationNumber =
    typeof body?.registrationNumber === "string"
      ? body.registrationNumber.trim()
      : undefined;
  const programmeId =
    typeof body?.programmeId === "string" ? body.programmeId.trim() : undefined;
  const academicYearLabel =
    typeof body?.academicYearLabel === "string" ? body.academicYearLabel.trim() : undefined;
  const yearRaw = body?.yearOfStudy !== undefined ? Number(body.yearOfStudy) : undefined;

  if (academicYearLabel !== undefined && !isAllowedAcademicYearLabel(academicYearLabel)) {
    return NextResponse.json({ error: "Invalid academic year." }, { status: 400 });
  }

  if (programmeId !== undefined) {
    const prog = await prisma.programme.findFirst({
      where: { id: programmeId, isActive: true },
    });
    if (!prog) {
      return NextResponse.json({ error: "Programme not found or inactive." }, { status: 400 });
    }
  }

  const userData = {};
  if (email !== undefined) userData.email = email;
  if (firstName !== undefined) userData.firstName = firstName.slice(0, 100);
  if (lastName !== undefined) userData.lastName = lastName.slice(0, 100);
  if (middleName !== undefined) userData.middleName = middleName ? middleName.slice(0, 100) : null;
  if (sex !== undefined) userData.sex = sex;
  if (profilePhotoUrl !== undefined) userData.profilePhotoUrl = profilePhotoUrl;

  const spData = {};
  if (studentNumber !== undefined) spData.studentNumber = effectiveSn.slice(0, 32);
  if (registrationNumber !== undefined) {
    spData.registrationNumber = registrationNumber.slice(0, 128);
  }
  if (programmeId !== undefined) spData.programmeId = programmeId;
  if (academicYearLabel !== undefined) spData.academicYearLabel = academicYearLabel;
  if (yearRaw !== undefined) {
    if (![1, 2, 3].includes(yearRaw)) {
      return NextResponse.json({ error: "Year of study must be 1, 2, or 3." }, { status: 400 });
    }
    spData.yearOfStudy = yearRaw;
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length > 0) {
        await tx.user.update({ where: { id }, data: userData });
      }
      if (Object.keys(spData).length > 0) {
        await tx.studentProfile.update({
          where: { userId: id },
          data: spData,
        });
      }
      // Admin year change: move ACTIVE enrollment to the selected year; preserve history.
      if (academicYearLabel !== undefined) {
        await ensureEnrollmentFromProfileLabel(tx, {
          userId: id,
          academicYearLabel,
        });
      }
    });
  } catch {
    return NextResponse.json(
      { error: "Could not update (duplicate email or student number?)." },
      { status: 400 },
    );
  }

  const updated = await prisma.user.findUnique({
    where: { id },
    include: { studentProfile: { include: { programme: true } } },
  });

  await writeAuditLog({
    eventType: AuditEvent.STUDENT_UPDATED,
    actorUserId: actor.id,
    targetUserId: id,
    meta: {
      email: updated?.email,
      summary: formatUserDisplayName(updated || existing),
    },
  });

  const actorLabel = formatUserDisplayName(actor);
  await notifyAllSystemAdmins({
    type: "ADMIN_STUDENT",
    title: "Student record updated",
    body: `${actorLabel} updated student ${updated?.email ?? id}.`,
  });

  return NextResponse.json({ ok: true });
}

/**
 * @param {{ params: Promise<{ id: string }> }} ctx
 */
export async function DELETE(_request, ctx) {
  const actor = await getSessionUser();
  const active = sessionActiveRole(actor);
  if (!actor || !canManageStudents(active)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    include: { studentProfile: true },
  });
  if (!existing?.studentProfile) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const label = formatUserDisplayName(existing);
  const em = existing.email;

  await prisma.user.delete({ where: { id } });

  await writeAuditLog({
    eventType: AuditEvent.STUDENT_DELETED,
    actorUserId: actor.id,
    targetUserId: null,
    meta: { email: em, summary: label },
  });

  const actorLabel = formatUserDisplayName(actor);
  await notifyAllSystemAdmins({
    type: "ADMIN_STUDENT",
    title: "Student deleted",
    body: `${actorLabel} deleted student account ${em}.`,
  });

  return NextResponse.json({ ok: true });
}
