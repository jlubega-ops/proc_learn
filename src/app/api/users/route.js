import { NextResponse } from "next/server";
import { AuthTokenType } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canManageStudents } from "@/lib/api/student-scope";
import { isRegisteredAcademicYearLabel } from "@/lib/academic/academic-context";
import { buildActivationUrl } from "@/lib/auth-links";
import { createAuthTokenRecord } from "@/lib/auth-token";
import { isStudentMubsEmail, isValidStudentNumberDigits } from "@/lib/mubs-email";
import { parseOptionalMaleFemaleSex } from "@/lib/validation/sex-male-female";
import { normalizeProfilePhotoInput } from "@/lib/profile-photo-url";
import { sendAccountActivationEmail } from "@/lib/invite-mail";
import { formatUserDisplayName } from "@/lib/user-display";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyAllSystemAdmins } from "@/lib/notify-system-admins";
import { prisma } from "@/lib/prisma";
import { insertPendingStudentUser } from "@/lib/student-insert";
import { parseCampus } from "@/lib/campuses";

export const runtime = "nodejs";

const ACTIVATION_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Create student only. Staff accounts use `POST /api/admin/staff`.
 */
export async function POST(request) {
  const actor = await getSessionUser();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const active = sessionActiveRole(actor);
  if (!canManageStudents(active)) {
    return NextResponse.json(
      { error: "Only system administrators and examiners can add students." },
      { status: 403 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body?.kind === "staff") {
    return NextResponse.json(
      { error: "Use POST /api/admin/staff to create staff users." },
      { status: 400 },
    );
  }

  return createStudentUser(actor, body);
}

/**
 * @param {import("@prisma/client").User} actor
 * @param {Record<string, unknown>} body
 */
async function createStudentUser(actor, body) {
  const email = String(body?.email ?? "")
    .trim()
    .toLowerCase();
  const firstName = String(body?.firstName ?? "").trim();
  const middleName = String(body?.middleName ?? "").trim() || null;
  const lastName = String(body?.lastName ?? "").trim();
  const sex = parseOptionalMaleFemaleSex(body?.sex);
  if (sex === undefined && body?.sex !== undefined && body?.sex !== null && body?.sex !== "") {
    return NextResponse.json({ error: "Invalid sex value." }, { status: 400 });
  }
  const profilePhotoUrl = normalizeProfilePhotoInput(body?.profilePhotoUrl);

  const studentNumber = String(body?.studentNumber ?? "").replace(/\D/g, "");
  const registrationNumber = String(body?.registrationNumber ?? "").trim();
  const programmeId = String(body?.programmeId ?? "").trim();
  const academicYearLabel = String(body?.academicYearLabel ?? "").trim();
  const yearRaw = Number(body?.yearOfStudy);
  const yearOfStudy = [1, 2, 3].includes(yearRaw) ? yearRaw : 3;
  const campus = parseCampus(body?.campus);

  if (!isStudentMubsEmail(email)) {
    return NextResponse.json(
      { error: "Student email must match 1234567@mubs.ac.ug (digits only before @)." },
      { status: 400 },
    );
  }
  if (!isValidStudentNumberDigits(studentNumber)) {
    return NextResponse.json(
      { error: "Student number must be 1–32 digits." },
      { status: 400 },
    );
  }
  if (!firstName || !lastName) {
    return NextResponse.json(
      { error: "First name and last name are required." },
      { status: 400 },
    );
  }
  if (!registrationNumber) {
    return NextResponse.json(
      { error: "Registration number is required." },
      { status: 400 },
    );
  }
  if (!programmeId) {
    return NextResponse.json({ error: "Programme is required." }, { status: 400 });
  }
  if (!campus) {
    return NextResponse.json(
      { error: "Campus is required (Main, Arua, Mbarara, Jinja, or Mbale)." },
      { status: 400 },
    );
  }
  if (!(await isRegisteredAcademicYearLabel(academicYearLabel))) {
    return NextResponse.json(
      { error: "Choose an academic year from Academic setup." },
      { status: 400 },
    );
  }

  const programme = await prisma.programme.findFirst({
    where: { id: programmeId, isActive: true },
  });
  if (!programme) {
    return NextResponse.json(
      { error: "Programme not found or inactive." },
      { status: 400 },
    );
  }

  const created = await insertPendingStudentUser(prisma, {
    email,
    firstName,
    lastName,
    middleName,
    studentNumber,
    registrationNumber,
    programmeId,
    academicYearLabel,
    yearOfStudy,
    campus,
    sex: sex ?? null,
    profilePhotoUrl,
  });
  if (!created) {
    return NextResponse.json(
      {
        error:
          "Could not create student (duplicate email, student number, or bad data).",
      },
      { status: 400 },
    );
  }

  try {
    const { ensureStudentPersonalOrg } = await import("@/lib/projects/student-personal-org");
    await ensureStudentPersonalOrg(prisma, created.id);
  } catch {
    /* personal org is also ensured on first student login */
  }

  const { rawToken } = await createAuthTokenRecord(
    created.id,
    AuthTokenType.ACCOUNT_ACTIVATION,
    ACTIVATION_MS,
  );

  if (process.env.NODE_ENV !== "production") {
    console.log(
      "[student-create] Activation URL (non-production only):",
      buildActivationUrl(rawToken),
    );
  }

  await sendAccountActivationEmail({
    email: created.email,
    rawToken,
    displayName: formatUserDisplayName(created),
  });

  await writeAuditLog({
    eventType: AuditEvent.STUDENT_CREATED,
    actorUserId: actor.id,
    targetUserId: created.id,
    meta: { email: created.email, summary: formatUserDisplayName(created) },
  });

  const actorLabel = formatUserDisplayName(actor);
  await notifyAllSystemAdmins({
    type: "ADMIN_STUDENT",
    title: "New student invited",
    body: `${actorLabel} created student ${created.email} (${studentNumber}).`,
  });

  return NextResponse.json({
    ok: true,
    userId: created.id,
    message: "Student created. Activation email sent.",
  });
}
