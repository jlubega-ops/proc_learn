import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { getStudentProjectResult } from "@/lib/academic/assessment-results";

export const runtime = "nodejs";

/** Student (or Student Mode) own result for one project — only when released. */
export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (activeRole !== Role.STUDENT) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const projectId = String(new URL(request.url).searchParams.get("projectId") || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const data = await getStudentProjectResult({ studentUserId: user.id, projectId });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
