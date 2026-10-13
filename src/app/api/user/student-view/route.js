import { NextResponse } from "next/server";
import {
  getSessionUser,
  sessionActiveRole,
  sessionUserGrantedRoles,
} from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { isStudentMode, permanentRoleIsStaff } from "@/lib/academic/student-mode";
import {
  getStudentView,
  parseStudentViewInput,
  saveStudentView,
} from "@/lib/academic/student-view";
import { buildSessionPayloadForUserId } from "@/lib/auth/session-payload";
import { prisma } from "@/lib/prisma";
import { cachedRead } from "@/lib/server-cache";
import { cachedJson } from "@/lib/api/cached-json";

export const runtime = "nodejs";

/** Staff Student Mode: programme + campus whose projects they follow. */
export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!permanentRoleIsStaff(sessionUserGrantedRoles(user))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const [studentView, programmes] = await Promise.all([
    getStudentView(prisma, user.id),
    cachedRead("programmes:active-options", ["Programme"], () =>
      prisma.programme.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, shortName: true },
      }),
    ),
  ]);
  return cachedJson(request, { studentView, programmes });
}

export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const granted = sessionUserGrantedRoles(user);
  if (!isStudentMode({ grantedRoles: granted, activeRole: sessionActiveRole(user) })) {
    return NextResponse.json({ error: "Switch to Student first." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = await parseStudentViewInput(prisma, body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, fieldErrors: { programmeId: parsed.error } },
      { status: 400 },
    );
  }

  const previous = await getStudentView(prisma, user.id);
  const studentView = await saveStudentView(prisma, user.id, {
    programmeId: parsed.programmeId,
    campus: parsed.campus,
  });

  await writeAuditLog({
    eventType: AuditEvent.STUDENT_VIEW_PROGRAMME_CHANGED,
    actorUserId: user.id,
    targetUserId: user.id,
    meta: {
      previousProgrammeId: previous?.programmeId || null,
      previousCampus: previous?.campus || null,
      programmeId: studentView?.programmeId || null,
      programmeName: studentView?.programmeName || null,
      campus: studentView?.campus || null,
    },
  });

  const payload = await buildSessionPayloadForUserId(user.id);
  return NextResponse.json({ ok: true, studentView, ...payload });
}
