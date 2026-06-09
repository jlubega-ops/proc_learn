import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { validateNewPassword } from "@/lib/password-policy";
import { prisma } from "@/lib/prisma";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";
import { grantedRoles } from "@/lib/roles";

export const runtime = "nodejs";

export async function POST(request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!sessionUser.mustChangePassword) {
    return NextResponse.json({ error: "Password setup is not required." }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  const confirm = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

  if (!newPassword) {
    return NextResponse.json({ error: "New password is required." }, { status: 400 });
  }
  if (newPassword !== confirm) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }

  const pw = validateNewPassword(newPassword);
  if (!pw.ok) {
    return NextResponse.json({ error: pw.error }, { status: 400 });
  }

  const roles = grantedRoles(sessionUser.userRoles);
  if (roles.includes(Role.STUDENT) && sessionUser.studentProfile?.studentNumber) {
    if (newPassword === sessionUser.studentProfile.studentNumber) {
      return NextResponse.json(
        { error: "Choose a password other than your student number." },
        { status: 400 },
      );
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: sessionUser.id },
    data: {
      passwordHash,
      mustChangePassword: false,
    },
  });

  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request);
  await writeAuditLog({
    eventType: AuditEvent.PASSWORD_CHANGED_SELF,
    actorUserId: sessionUser.id,
    targetUserId: sessionUser.id,
    ip,
    userAgent,
    meta: { firstSetup: true, method: "password" },
  });

  return NextResponse.json({ ok: true });
}
