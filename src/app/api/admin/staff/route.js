import { NextResponse } from "next/server";
import { Role, UserAccountStatus } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canManageStaffUsers } from "@/lib/api/student-scope";
import { generateInitialPassword } from "@/lib/auth/generate-initial-password";
import { isStaffMubsEmail } from "@/lib/mubs-email";
import { normalizeProfilePhotoInput } from "@/lib/profile-photo-url";
import { sendStaffWelcomeEmail } from "@/lib/invite-mail";
import { formatUserDisplayName } from "@/lib/user-display";
import { pickHighestGrantedRole, validateGrantedRolesForSave } from "@/lib/roles";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyAllSystemAdmins } from "@/lib/notify-system-admins";
import { insertStaffUserWithPassword } from "@/lib/staff-insert";
import { prisma } from "@/lib/prisma";
import { parseOptionalMaleFemaleSex } from "@/lib/validation/sex-male-female";

export const runtime = "nodejs";

/**
 * @param {import("@prisma/client").User & { userRoles: import("@prisma/client").UserRole[] }} u
 */
function serializeStaff(u) {
  const roles = u.userRoles.map((r) => r.role);
  const canResendActivation =
    !u.activatedAt && u.accountStatus !== UserAccountStatus.SUSPENDED;
  const canResendWelcome =
    Boolean(u.mustChangePassword) && u.accountStatus !== UserAccountStatus.SUSPENDED;
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
    mustChangePassword: Boolean(u.mustChangePassword),
    roles,
    canResendActivation,
    canResendWelcome,
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
  const plainPassword = generateInitialPassword();

  const created = await insertStaffUserWithPassword(prisma, {
    email,
    firstName,
    lastName,
    middleName,
    sex: sex ?? null,
    profilePhotoUrl,
    roles: /** @type {Role[]} */ (roles),
    activeRole: /** @type {Role} */ (activeRole),
    plainPassword,
  });

  if (!created) {
    return NextResponse.json(
      { error: "Could not create user (email may already exist)." },
      { status: 400 },
    );
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(
      "[staff-create] Welcome email temp password (non-production only):",
      plainPassword,
    );
  }

  await sendStaffWelcomeEmail({
    email: created.email,
    displayName: formatUserDisplayName(created),
    temporaryPassword: plainPassword,
    roles,
  });

  await writeAuditLog({
    eventType: AuditEvent.STAFF_USER_CREATED,
    actorUserId: actor.id,
    targetUserId: created.id,
    meta: { email: created.email, roles, delivery: "welcome_email" },
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
    message: "Staff user created. Welcome email with sign-in details sent.",
  });
}
