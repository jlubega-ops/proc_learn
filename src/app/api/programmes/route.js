import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyAllSystemAdmins } from "@/lib/notify-system-admins";
import { formatUserDisplayName } from "@/lib/user-display";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const active = sessionActiveRole(user);
  const isAdmin = active === Role.SYSTEM_ADMIN;

  const rows = await prisma.programme.findMany({
    where: isAdmin ? {} : { isActive: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ programmes: rows });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || sessionActiveRole(user) !== Role.SYSTEM_ADMIN) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const shortName =
    typeof body?.shortName === "string" ? body.shortName.trim() : "";
  if (!name || !shortName) {
    return NextResponse.json(
      { error: "Programme name and short name are required." },
      { status: 400 },
    );
  }

  let defaultYearOfStudy = 3;
  if (body?.defaultYearOfStudy !== undefined && body?.defaultYearOfStudy !== null) {
    const y = Number(body.defaultYearOfStudy);
    if (![1, 2, 3].includes(y)) {
      return NextResponse.json(
        { error: "Default year of study must be 1, 2, or 3." },
        { status: 400 },
      );
    }
    defaultYearOfStudy = y;
  }

  const row = await prisma.programme.create({
    data: {
      name: name.slice(0, 255),
      shortName: shortName.slice(0, 64),
      isActive: body?.isActive === false ? false : true,
      defaultYearOfStudy,
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROGRAMME_CREATED,
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
    title: "Programme created",
    body: `${actorLabel} added programme "${row.name}" (${row.shortName}).`,
  });

  return NextResponse.json({ programme: row });
}
