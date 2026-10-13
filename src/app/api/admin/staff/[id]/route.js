import { NextResponse } from "next/server";
import { Role, UserAccountStatus } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canManageStaffUsers } from "@/lib/api/student-scope";
import { normalizeProfilePhotoInput } from "@/lib/profile-photo-url";
import { sanitizeActiveRole, validateGrantedRolesForSave } from "@/lib/roles";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyAllSystemAdmins } from "@/lib/notify-system-admins";
import { formatUserDisplayName } from "@/lib/user-display";
import { prisma } from "@/lib/prisma";
import { parseOptionalMaleFemaleSex } from "@/lib/validation/sex-male-female";
import { PURGE_TX_OPTIONS, deleteProjectsOwnedByUser } from "@/lib/projects/purge-project-data";

export const runtime = "nodejs";

const STAFF_ROLES = [Role.EXAMINER, Role.SYSTEM_ADMIN];

/** True when no other non-suspended user holds SYSTEM_ADMIN. */
async function isLastSystemAdmin(userId) {
  const others = await prisma.userRole.count({
    where: {
      role: Role.SYSTEM_ADMIN,
      userId: { not: userId },
      user: { accountStatus: { not: UserAccountStatus.SUSPENDED } },
    },
  });
  return others === 0;
}

/**
 * @param {string} userId
 */
async function assertStaffUser(userId) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: true, studentProfile: true, settings: true },
  });
  if (!u) return { error: "User not found.", status: 404 };
  if (u.studentProfile) {
    return { error: "Use student endpoints for student accounts.", status: 400 };
  }
  const hasStaff = u.userRoles.some((r) =>
    [Role.EXAMINER, Role.SYSTEM_ADMIN].includes(r.role),
  );
  if (!hasStaff) {
    return { error: "Not a staff account.", status: 400 };
  }
  return { user: u };
}

/**
 * @param {{ params: Promise<{ id: string }> }} ctx
 */
export async function PATCH(request, ctx) {
  const actor = await getSessionUser();
  if (!actor || !canManageStaffUsers(sessionActiveRole(actor))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  const check = await assertStaffUser(id);
  if ("error" in check) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
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

  const rolesRaw = Array.isArray(body?.roles) ? body.roles : null;
  let roles;
  if (rolesRaw) {
    roles = [...new Set(rolesRaw.map((r) => String(r).toUpperCase()))];
    const vr = validateGrantedRolesForSave(roles);
    if (!vr.ok) {
      return NextResponse.json({ error: vr.error }, { status: 400 });
    }
    if (!roles.length || roles.some((r) => !STAFF_ROLES.includes(r))) {
      return NextResponse.json(
        { error: "Choose Examiner and/or System admin." },
        { status: 400 },
      );
    }
    const wasAdmin = check.user.userRoles.some((r) => r.role === Role.SYSTEM_ADMIN);
    if (wasAdmin && !roles.includes(Role.SYSTEM_ADMIN) && (await isLastSystemAdmin(id))) {
      return NextResponse.json(
        { error: "Keep at least one system admin." },
        { status: 400 },
      );
    }
  }

  const userData = {};
  if (firstName !== undefined) userData.firstName = firstName.slice(0, 100);
  if (lastName !== undefined) userData.lastName = lastName.slice(0, 100);
  if (middleName !== undefined) userData.middleName = middleName ? middleName.slice(0, 100) : null;
  if (sex !== undefined) userData.sex = sex;
  if (profilePhotoUrl !== undefined) userData.profilePhotoUrl = profilePhotoUrl;

  try {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length > 0) {
        await tx.user.update({ where: { id }, data: userData });
      }
      if (roles) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roles.map((role) => ({
            userId: id,
            role: /** @type {Role} */ (role),
          })),
        });
        const granted = roles;
        const stored = String(check.user.settings?.activeRole ?? "").trim();
        const nextActive = sanitizeActiveRole(granted, stored);
        await tx.userSettings.upsert({
          where: { userId: id },
          create: {
            userId: id,
            theme: "light",
            activeRole: nextActive,
          },
          update: { activeRole: nextActive },
        });
      }
    });
  } catch {
    return NextResponse.json({ error: "Could not update user." }, { status: 400 });
  }

  await writeAuditLog({
    eventType: AuditEvent.STAFF_USER_UPDATED,
    actorUserId: actor.id,
    targetUserId: id,
    meta: { email: check.user.email },
  });

  const actorLabel = formatUserDisplayName(actor);
  await notifyAllSystemAdmins({
    type: "ADMIN_STAFF",
    title: "Staff user updated",
    body: `${actorLabel} updated staff account ${check.user.email}.`,
  });

  return NextResponse.json({ ok: true });
}

/**
 * @param {{ params: Promise<{ id: string }> }} ctx
 */
export async function DELETE(request, ctx) {
  const actor = await getSessionUser();
  if (!actor || !canManageStaffUsers(sessionActiveRole(actor))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id || id === actor.id) {
    return NextResponse.json(
      { error: id === actor.id ? "You cannot delete your own account here." : "Missing id." },
      { status: 400 },
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (String(body?.confirmText || "").trim() !== "DELETE") {
    return NextResponse.json(
      {
        error:
          'Deletion not confirmed. Type "DELETE" in all caps to permanently remove this account and related data.',
      },
      { status: 400 },
    );
  }

  const check = await assertStaffUser(id);
  if ("error" in check) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  if (
    check.user.userRoles.some((r) => r.role === Role.SYSTEM_ADMIN) &&
    (await isLastSystemAdmin(id))
  ) {
    return NextResponse.json({ error: "Keep at least one system admin." }, { status: 400 });
  }

  const em = check.user.email;
  const label = formatUserDisplayName(check.user);

  await prisma.$transaction(async (tx) => {
    await deleteProjectsOwnedByUser(tx, id);
    await tx.user.delete({ where: { id } });
  }, PURGE_TX_OPTIONS);

  await writeAuditLog({
    eventType: AuditEvent.STAFF_USER_DELETED,
    actorUserId: actor.id,
    targetUserId: null,
    meta: { email: em, summary: label },
  });

  const actorLabel = formatUserDisplayName(actor);
  await notifyAllSystemAdmins({
    type: "ADMIN_STAFF",
    title: "Staff user deleted",
    body: `${actorLabel} deleted staff account ${em}.`,
  });

  return NextResponse.json({ ok: true });
}
