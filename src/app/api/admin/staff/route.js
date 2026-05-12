import crypto from "node:crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { AuthTokenType, Role, UserAccountStatus } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canManageStaffUsers } from "@/lib/api/student-scope";
import { isStaffMubsEmail } from "@/lib/mubs-email";
import { normalizeProfilePhotoInput } from "@/lib/profile-photo-url";
import { sendAccountActivationEmail } from "@/lib/invite-mail";
import { formatUserDisplayName } from "@/lib/user-display";
import { pickHighestGrantedRole, validateGrantedRolesForSave } from "@/lib/roles";
import { createAuthTokenRecord } from "@/lib/auth-token";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyAllSystemAdmins } from "@/lib/notify-system-admins";
import { prisma } from "@/lib/prisma";
import { parseOptionalMaleFemaleSex } from "@/lib/validation/sex-male-female";

export const runtime = "nodejs";

const ACTIVATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {import("@prisma/client").User & { userRoles: import("@prisma/client").UserRole[] }} u
 */
function serializeStaff(u) {
  const roles = u.userRoles.map((r) => r.role);
  const canResendActivation =
    !u.activatedAt && u.accountStatus !== UserAccountStatus.SUSPENDED;
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    middleName: u.middleName,
    lastName: u.lastName,
    displayName: formatUserDisplayName(u),
    accountStatus: u.accountStatus,
    suspendedReason: u.suspendedReason,
    activatedAt: u.activatedAt,
    lastLoginAt: u.lastLoginAt,
    roles,
    canResendActivation,
  };
}

export async function GET() {
  const actor = await getSessionUser();
  if (!actor || !canManageStaffUsers(sessionActiveRole(actor))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const rows = await prisma.user.findMany({
    where: {
      userRoles: {
        some: {
          role: { in: [Role.LECTURER, Role.EXAMINER, Role.SYSTEM_ADMIN] },
        },
      },
    },
    include: { userRoles: true, settings: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return NextResponse.json({ users: rows.map(serializeStaff) });
}

export async function POST(request) {
  const actor = await getSessionUser();
  if (!actor || !canManageStaffUsers(sessionActiveRole(actor))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

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

  if (!isStaffMubsEmail(email)) {
    return NextResponse.json(
      { error: "Staff email must be a valid @mubs.ac.ug address (not a numeric student address)." },
      { status: 400 },
    );
  }
  if (!firstName || !lastName) {
    return NextResponse.json(
      { error: "First name and last name are required." },
      { status: 400 },
    );
  }

  const rolesRaw = Array.isArray(body?.roles) ? body.roles : [];
  const roles = [...new Set(rolesRaw.map((r) => String(r).toUpperCase()))];
  const vr = validateGrantedRolesForSave(roles);
  if (!vr.ok) {
    return NextResponse.json({ error: vr.error }, { status: 400 });
  }

  const activeRole = pickHighestGrantedRole(roles);

  const passwordHash = await bcrypt.hash(crypto.randomBytes(48).toString("hex"), 12);

  let created;
  try {
    created = await prisma.user.create({
      data: {
        email,
        firstName: firstName.slice(0, 100),
        middleName: middleName ? middleName.slice(0, 100) : null,
        lastName: lastName.slice(0, 100),
        sex: sex ?? null,
        profilePhotoUrl,
        passwordHash,
        accountStatus: UserAccountStatus.PENDING_ACTIVATION,
        activatedAt: null,
        userRoles: {
          create: roles.map((role) => ({ role: /** @type {Role} */ (role) })),
        },
        settings: {
          create: {
            theme: "light",
            activeRole: /** @type {Role} */ (activeRole),
          },
        },
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not create user (email may already exist)." },
      { status: 400 },
    );
  }

  const { rawToken } = await createAuthTokenRecord(
    created.id,
    AuthTokenType.ACCOUNT_ACTIVATION,
    ACTIVATION_MS,
  );

  await sendAccountActivationEmail({
    email: created.email,
    rawToken,
    displayName: formatUserDisplayName(created),
  });

  await writeAuditLog({
    eventType: AuditEvent.STAFF_USER_CREATED,
    actorUserId: actor.id,
    targetUserId: created.id,
    meta: { email: created.email, roles },
  });

  const actorLabel = formatUserDisplayName(actor);
  await notifyAllSystemAdmins({
    type: "ADMIN_STAFF",
    title: "Staff user created",
    body: `${actorLabel} invited ${created.email} with roles: ${roles.join(", ")}.`,
  });

  return NextResponse.json({
    ok: true,
    userId: created.id,
    message: "User created. Activation email sent.",
  });
}
