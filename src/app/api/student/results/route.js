import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { listStudentOwnResults } from "@/lib/academic/assessment-results";

export const runtime = "nodejs";

/** Student (or Student Mode) own results — scores only when released. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (activeRole !== Role.STUDENT) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const results = await listStudentOwnResults({ studentUserId: user.id });
  return NextResponse.json({ results });
}
