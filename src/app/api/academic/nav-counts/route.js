import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { countOpenAcademicProjectsForStudent } from "@/lib/academic/student-project-eligibility";

export const runtime = "nodejs";

/** Open Practice / Assessment projects meant for the student, keyed by sidebar href. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (sessionActiveRole(user) !== Role.STUDENT) {
    return NextResponse.json({ byHref: {} });
  }

  const counts = await countOpenAcademicProjectsForStudent(prisma, user.id);
  return NextResponse.json(
    {
      byHref: {
        "/academic/practice": counts.practice,
        "/academic/assessments": counts.assessments,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
