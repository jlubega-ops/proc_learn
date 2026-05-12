import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyAllSystemAdmins } from "@/lib/notify-system-admins";
import { formatUserDisplayName } from "@/lib/user-display";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * @param {{ params: Promise<{ id: string }> }} ctx
 */
export async function PATCH(request, ctx) {
  const user = await getSessionUser();
  if (!user || sessionActiveRole(user) !== Role.SYSTEM_ADMIN) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const data = {};
  if (typeof body?.name === "string") data.name = body.name.trim().slice(0, 255);
  if (typeof body?.shortName === "string") {
    data.shortName = body.shortName.trim().slice(0, 64);
  }
  if (typeof body?.isActive === "boolean") data.isActive = body.isActive;
  if (body?.defaultYearOfStudy !== undefined && body?.defaultYearOfStudy !== null) {
    const y = Number(body.defaultYearOfStudy);
    if (![1, 2, 3].includes(y)) {
      return NextResponse.json(
        { error: "Default year of study must be 1, 2, or 3." },
        { status: 400 },
      );
    }
    data.defaultYearOfStudy = y;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  try {
    const row = await prisma.programme.update({
      where: { id },
      data,
    });

    await writeAuditLog({
      eventType: AuditEvent.PROGRAMME_UPDATED,
      actorUserId: user.id,
      meta: {
        programmeId: row.id,
        name: row.name,
        shortName: row.shortName,
        isActive: row.isActive,
        defaultYearOfStudy: row.defaultYearOfStudy,
      },
    });

    const actorLabel = formatUserDisplayName(user);
    await notifyAllSystemAdmins({
      type: "ADMIN_PROGRAMME",
      title: "Programme updated",
      body: `${actorLabel} updated programme "${row.name}" (${row.shortName}).`,
    });

    return NextResponse.json({ programme: row });
  } catch {
    return NextResponse.json({ error: "Programme not found." }, { status: 404 });
  }
}

/**
 * @param {{ params: Promise<{ id: string }> }} ctx
 */
export async function DELETE(_request, ctx) {
  const user = await getSessionUser();
  if (!user || sessionActiveRole(user) !== Role.SYSTEM_ADMIN) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  const existing = await prisma.programme.findUnique({
    where: { id },
    include: { _count: { select: { students: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Programme not found." }, { status: 404 });
  }
  if (existing._count.students > 0) {
    return NextResponse.json(
      {
        error:
          "This programme has student records. Deactivate it instead of deleting, or reassign students first.",
      },
      { status: 400 },
    );
  }

  await prisma.programme.delete({ where: { id } });

  await writeAuditLog({
    eventType: AuditEvent.PROGRAMME_DELETED,
    actorUserId: user.id,
    meta: {
      programmeId: id,
      name: existing.name,
      shortName: existing.shortName,
    },
  });

  const actorLabel = formatUserDisplayName(user);
  await notifyAllSystemAdmins({
    type: "ADMIN_PROGRAMME",
    title: "Programme deleted",
    body: `${actorLabel} deleted programme "${existing.name}" (${existing.shortName}).`,
  });

  return NextResponse.json({ ok: true });
}
