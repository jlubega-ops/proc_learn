import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/api/get-session-user";
import { mutateActiveAppSession } from "@/lib/auth/session";
import { buildIronSessionOptions } from "@/lib/auth/session-options";
import { switchActiveRole } from "@/lib/academic/switch-active-role";

export const runtime = "nodejs";

export async function POST(request) {
  if (!buildIronSessionOptions()) {
    return NextResponse.json(
      { error: "Server auth is not configured (SESSION_SECRET)." },
      { status: 503 },
    );
  }

  const session = await mutateActiveAppSession();
  if (!session?.userId || !(await getSessionUser())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const nextRole = typeof body?.role === "string" ? body.role.trim() : "";
  const hasStudentView = body && typeof body === "object" && "programmeId" in body;
  const result = await switchActiveRole({
    userId: session.userId,
    nextRole,
    studentView: hasStudentView ? { programmeId: body.programmeId, campus: body.campus } : null,
    buildPayload: true,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, ...result.payload });
}
