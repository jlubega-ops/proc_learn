import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import {
  buildPersonalOrgLabels,
  ensureStudentPersonalOrg,
} from "@/lib/projects/student-personal-org";
import { buildOrgDisplayName, validateOrgNameBase } from "@/lib/validation/org-display-name";

export const runtime = "nodejs";

/**
 * Body: { name: string } — the part before the fixed "Organisation" word
 *     | { reset: true } — back to "{Student Name} Organisation"
 */
export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (sessionActiveRole(user) !== Role.STUDENT) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const org = await ensureStudentPersonalOrg(prisma, user.id);
  if (!org?.id) {
    return NextResponse.json({ error: "Organisation not available." }, { status: 404 });
  }

  const reset = body?.reset === true;
  let organizationName;
  if (reset) {
    const owner = await prisma.user.findUnique({
      where: { id: user.id },
      select: { firstName: true, middleName: true, lastName: true },
    });
    organizationName = buildPersonalOrgLabels(owner || {}).organizationName;
  } else {
    const check = validateOrgNameBase(body?.name);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error, fieldErrors: { name: check.error } },
        { status: 400 },
      );
    }
    organizationName = buildOrgDisplayName(check.value);
  }

  const previous = org.organizationName || org.name;
  const updated = await prisma.project.update({
    where: { id: org.id },
    data: { organizationName },
    select: { id: true, name: true, organizationName: true },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_DISPLAY_NAME_UPDATED,
    actorUserId: user.id,
    meta: {
      projectId: org.id,
      previous,
      next: organizationName,
      reset,
      description: reset
        ? `Organisation name reset to "${organizationName}".`
        : `Organisation name changed from "${previous}" to "${organizationName}".`,
    },
  });

  return NextResponse.json({
    ok: true,
    defaultName: updated.name,
    organizationName: updated.organizationName,
  });
}
