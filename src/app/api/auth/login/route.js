import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { UserAccountStatus } from "@prisma/client";
import { getAppSession, initSessionActivity } from "@/lib/auth/session";
import { buildIronSessionOptions } from "@/lib/auth/session-options";
import { buildSessionPayloadForUserId } from "@/lib/auth/session-payload";
import { prisma } from "@/lib/prisma";
import { grantedRoles, pickHighestGrantedRole } from "@/lib/roles";
import {
  normalizeLoginEmail,
  validateLoginFields,
} from "@/lib/validation/login";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";
import { isOrgLoginIdentifier } from "@/lib/projects/org-login-identity";
import { authenticateProjectOrgUserLogin } from "@/lib/projects/org-login-auth";
import { buildSessionPayloadForOrgUserId } from "@/lib/auth/org-session-payload";

export const runtime = "nodejs";

export async function POST(request) {
  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request);

  if (!buildIronSessionOptions()) {
    return NextResponse.json(
      { error: "Server auth is not configured (SESSION_SECRET)." },
      { status: 503 },
    );
  }

  const session = await getAppSession();
  if (!session) {
    return NextResponse.json(
      { error: "Server auth is not configured (SESSION_SECRET)." },
      { status: 503 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawId = body?.identifier ?? body?.email;
  const password = typeof body?.password === "string" ? body.password : "";
  const fieldErrors = validateLoginFields({
    identifier: rawId,
    password,
  });
  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json(
      { error: "Validation failed.", fields: fieldErrors },
      { status: 400 },
    );
  }

  if (isOrgLoginIdentifier(rawId)) {
    const orgAuth = await authenticateProjectOrgUserLogin({
      identifier: String(rawId),
      password,
    });

    if (!orgAuth.ok) {
      const messages = {
        invalid_credentials: "Invalid username or password.",
        project_unavailable:
          "This project is not available. Sign in is only allowed when the project is published.",
        ambiguous_account:
          "Multiple accounts match this username. Contact your project administrator.",
        invalid_format: "Enter a valid organisation username.",
      };
      await writeAuditLog({
        eventType: AuditEvent.PROJECT_ORG_USER_LOGIN_FAILURE,
        ip,
        userAgent,
        meta: {
          identifier: String(rawId).trim().toLowerCase(),
          code: orgAuth.code,
          method: "org_password",
        },
      });
      return NextResponse.json(
        { error: messages[orgAuth.code] || "Invalid username or password." },
        { status: orgAuth.code === "project_unavailable" ? 403 : 401 },
      );
    }

    delete session.userId;
    session.orgUserId = orgAuth.orgUser.id;
    initSessionActivity(session);
    await session.save();

    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ORG_USER_LOGIN_SUCCESS,
      meta: {
        projectId: orgAuth.project.id,
        projectOrgUserId: orgAuth.orgUser.id,
        roleName: orgAuth.orgUser.projectOrgRole?.name,
        identifier: String(rawId).trim().toLowerCase(),
        method: "org_password",
      },
      ip,
      userAgent,
    });

    const payload = await buildSessionPayloadForOrgUserId(orgAuth.orgUser.id);
    return NextResponse.json({ ok: true, ...payload });
  }

  const email = normalizeLoginEmail(rawId);
  const user = await prisma.user.findUnique({
    where: { email },
    include: { settings: true, userRoles: true },
  });

  if (!user) {
    await writeAuditLog({
      eventType: AuditEvent.LOGIN_FAILURE,
      ip,
      userAgent,
      meta: { email, method: "password" },
    });
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  if (user.accountStatus === UserAccountStatus.SUSPENDED) {
    await writeAuditLog({
      eventType: AuditEvent.LOGIN_FAILURE,
      actorUserId: user.id,
      targetUserId: user.id,
      ip,
      userAgent,
      meta: { email, reason: "suspended", method: "password" },
    });
    return NextResponse.json(
      { error: "Your account has been suspended. Contact support." },
      { status: 403 },
    );
  }

  if (!user.activatedAt) {
    await writeAuditLog({
      eventType: AuditEvent.LOGIN_FAILURE,
      actorUserId: user.id,
      targetUserId: user.id,
      ip,
      userAgent,
      meta: { email, reason: "pending_activation", method: "password" },
    });
    return NextResponse.json(
      {
        error:
          "This account is not activated yet. Use the link in your invitation email, sign in with Google if enabled, or use Forgot password — after you set a new password your account will be activated.",
      },
      { status: 403 },
    );
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    await writeAuditLog({
      eventType: AuditEvent.LOGIN_FAILURE,
      targetUserId: user.id,
      ip,
      userAgent,
      meta: { email, method: "password" },
    });
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  delete session.orgUserId;
  session.userId = user.id;
  initSessionActivity(session);
  await session.save();

  const granted = grantedRoles(user.userRoles);
  const loginActiveRole = pickHighestGrantedRole(granted);
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      theme: "light",
      activeRole: loginActiveRole,
    },
    update: { activeRole: loginActiveRole },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await writeAuditLog({
    eventType: AuditEvent.LOGIN_SUCCESS,
    actorUserId: user.id,
    targetUserId: user.id,
    ip,
    userAgent,
    meta: { email, method: "password" },
  });

  const payload = await buildSessionPayloadForUserId(user.id);
  const redirectTo = payload.mustChangePassword
    ? "/setup-password"
    : typeof payload.defaultPath === "string" && payload.defaultPath.startsWith("/")
      ? payload.defaultPath
      : undefined;
  return NextResponse.json({ ok: true, ...payload, redirectTo });
}
