import { NextResponse } from "next/server";
import { ProjectPurpose, Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { listStudentAcademicProjects } from "@/lib/academic/project-attempts";

export const runtime = "nodejs";

/**
 * Student catalog: published Practice or Assessment academic projects.
 * Query: purpose=PRACTICE|ASSESSMENT
 */
export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (sessionActiveRole(user) !== Role.STUDENT) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const purposeRaw = (request.nextUrl.searchParams.get("purpose") || "PRACTICE").toUpperCase();
  const purpose =
    purposeRaw === ProjectPurpose.ASSESSMENT
      ? ProjectPurpose.ASSESSMENT
      : ProjectPurpose.PRACTICE;

  const projects = await listStudentAcademicProjects({
    studentUserId: user.id,
    purpose,
  });

  return NextResponse.json({ purpose, projects });
}
